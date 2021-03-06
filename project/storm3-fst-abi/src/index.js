const _ = require('underscore');
const utils = require('storm3-utils');

const EthersAbi = require('ethers/utils/abi-coder').AbiCoder;
const ethersAbiCoder = new EthersAbi(function (type, value) {
  if (type.match(/^u?int/) && !_.isArray(value) && (!_.isObject(value) || value.constructor.name !== 'BN')) {
    return value.toString();
  }
  return value;
});

// result method
function Result() {
}

/**
 * ABICoder prototype should be used to encode/decode solidity params of any type
 */
const ABICoder = function () {
};

/**
 * Encodes the function name to its ABI representation, which are the first 4 bytes of the sha3 of the function name including  types.
 *
 * @method encodeFunctionSignature
 * @param {String|Object} functionName
 * @return {String} encoded function name
 */
ABICoder.prototype.encodeFunctionSignature = function (functionName) {
  if (_.isObject(functionName)) {
    functionName = utils._jsonInterfaceMethodToString(functionName);
  }

  return utils.sha3(functionName).slice(0, 10);
};

/**
 * Encodes the function name to its ABI representation, which are the first 4 bytes of the sha3 of the function name including  types.
 *
 * @method encodeEventSignature
 * @param {String|Object} functionName
 * @return {String} encoded function name
 */
ABICoder.prototype.encodeEventSignature = function (functionName) {
  if (_.isObject(functionName)) {
    functionName = utils._jsonInterfaceMethodToString(functionName);
  }

  return utils.sha3(functionName);
};

/**
 * Should be used to encode plain param
 *
 * @method encodeParameter
 * @param {String} type
 * @param {Object} param
 * @return {String} encoded plain param
 */
ABICoder.prototype.encodeParameter = function (type, param) {
  return this.encodeParameters([type], [param]);
};

/**
 * Should be used to encode list of params
 *
 * @method encodeParameters
 * @param {Array} types
 * @param {Array} params
 * @return {String} encoded list of params
 */
ABICoder.prototype.encodeParameters = function (types, params) {
  return ethersAbiCoder.encode(this.mapTypes(types), params);
};

/**
 * Map types if simplified format is used
 *
 * @method mapTypes
 * @param {Array} types
 * @return {Array}
 */
ABICoder.prototype.mapTypes = function (types) {
  let self = this;
  let mappedTypes = [];
  types.forEach(function (type) {
    if (self.isSimplifiedStructFormat(type)) {
      let structName = Object.keys(type)[0];
      mappedTypes.push(
        Object.assign(
          self.mapStructNameAndType(structName),
          {
            components: self.mapStructToCoderFormat(type[structName])
          }
        )
      );

      return;
    }

    mappedTypes.push(type);
  });

  return mappedTypes;
};

/**
 * Check if type is simplified struct format
 *
 * @method isSimplifiedStructFormat
 * @param {string | Object} type
 * @returns {boolean}
 */
ABICoder.prototype.isSimplifiedStructFormat = function (type) {
  return typeof type === 'object' && typeof type.components === 'undefined' && typeof type.name === 'undefined';
};

/**
 * Maps the correct tuple type and name when the simplified format in encode/decodeParameter is used
 *
 * @method mapStructNameAndType
 * @param {string} structName
 * @return {{type: string, name: *}}
 */
ABICoder.prototype.mapStructNameAndType = function (structName) {
  let type = 'tuple';

  if (structName.indexOf('[]') > -1) {
    type = 'tuple[]';
    structName = structName.slice(0, -2);
  }

  return {type: type, name: structName};
};

/**
 * Maps the simplified format in to the expected format of the ABICoder
 *
 * @method mapStructToCoderFormat
 * @param {Object} struct
 * @return {Array}
 */
ABICoder.prototype.mapStructToCoderFormat = function (struct) {
  let self = this;
  let components = [];
  Object.keys(struct).forEach(function (key) {
    if (typeof struct[key] === 'object') {
      components.push(
        Object.assign(
          self.mapStructNameAndType(key),
          {
            components: self.mapStructToCoderFormat(struct[key])
          }
        )
      );

      return;
    }

    components.push({
      name: key,
      type: struct[key]
    });
  });

  return components;
};

/**
 * Encodes a function call from its json interface and parameters.
 *
 * @method encodeFunctionCall
 * @param {Array} jsonInterface
 * @param {Array} params
 * @return {String} The encoded ABI for this function call
 */
ABICoder.prototype.encodeFunctionCall = function (jsonInterface, params) {
  return this.encodeFunctionSignature(jsonInterface) + this.encodeParameters(jsonInterface.inputs, params).replace('0x', '');
};

/**
 * Should be used to decode bytes to plain param
 *
 * @method decodeParameter
 * @param {String} type
 * @param {String} bytes
 * @return {Object} plain param
 */
ABICoder.prototype.decodeParameter = function (type, bytes) {
  return this.decodeParameters([type], bytes)[0];
};

/**
 * Should be used to decode list of params
 *
 * @method decodeParameter
 * @param {Array} outputs
 * @param {String} bytes
 * @return {Array} array of plain params
 */
ABICoder.prototype.decodeParameters = function (outputs, bytes) {
  if (outputs.length > 0 && (!bytes || bytes === '0x' || bytes === '0X')) {
    throw new Error(
      'Returned values aren\'t valid, did it run Out of Gas? ' +
      'You might also see this error if you are not using the ' +
      'correct ABI for the contract you are retrieving data from, ' +
      'requesting data from a block number that does not exist, ' +
      'or querying a node which is not fully synced.'
    );
  }

  let res = ethersAbiCoder.decode(this.mapTypes(outputs), '0x' + bytes.replace(/0x/i, ''));
  let returnValue = new Result();
  returnValue.__length__ = 0;

  outputs.forEach(function (output, i) {
    let decodedValue = res[returnValue.__length__];
    decodedValue = (decodedValue === '0x') ? null : decodedValue;

    returnValue[i] = decodedValue;

    if (_.isObject(output) && output.name) {
      returnValue[output.name] = decodedValue;
    }

    returnValue.__length__++;
  });

  return returnValue;
};

/**
 * Decodes events non- and indexed parameters.
 *
 * @method decodeLog
 * @param {Object} inputs
 * @param {String} data
 * @param {Array} topics
 * @return {Array} array of plain params
 */
ABICoder.prototype.decodeLog = function (inputs, data, topics) {
  let _this = this;
  topics = _.isArray(topics) ? topics : [topics];

  data = data || '';

  let notIndexedInputs = [];
  let indexedParams = [];
  let topicCount = 0;

  // TODO check for anonymous logs?

  inputs.forEach(function (input, i) {
    if (input.indexed) {
      indexedParams[i] = (['bool', 'int', 'uint', 'address', 'fixed', 'ufixed'].find(function (staticType) {
        return input.type.indexOf(staticType) !== -1;
      })) ? _this.decodeParameter(input.type, topics[topicCount]) : topics[topicCount];
      topicCount++;
    } else {
      notIndexedInputs[i] = input;
    }
  });


  let nonIndexedData = data;
  let notIndexedParams = (nonIndexedData) ? this.decodeParameters(notIndexedInputs, nonIndexedData) : [];

  let returnValue = new Result();
  returnValue.__length__ = 0;


  inputs.forEach(function (res, i) {
    returnValue[i] = (res.type === 'string') ? '' : null;

    if (typeof notIndexedParams[i] !== 'undefined') {
      returnValue[i] = notIndexedParams[i];
    }
    if (typeof indexedParams[i] !== 'undefined') {
      returnValue[i] = indexedParams[i];
    }

    if (res.name) {
      returnValue[res.name] = returnValue[i];
    }

    returnValue.__length__++;
  });

  return returnValue;
};

let coder = new ABICoder();

module.exports = coder;
