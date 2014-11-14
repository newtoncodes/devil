/**
 * V8 Helper functions
 *
 * Fully copied from node-inspector
 * https://github.com/node-inspector/node-inspector
 */
var v8 = {Helper: {}};
module.exports = v8.Helper;

v8.Helper.v8ScopeTypeToString = function (v8ScopeType) {
    switch (v8ScopeType) {
        case 0:
            return 'global';
        case 1:
            return 'local';
        case 2:
            return 'with';
        case 3:
            return 'closure';
        case 4:
            return 'catch';
        default:
            return 'unknown';
    }
};

v8.Helper.v8RefToInspectorObject = function (ref) {
    var desc = '',
        type = ref.type,
        subtype,
        size,
        name,
        objectId,
        inspectorResult;

    switch (type) {
        case 'object':
            name = /#<(\w+)>/.exec(ref.text);
            if (name && name.length > 1) {
                desc = name[1];
                if (desc === 'Array' || desc === 'Buffer') {
                    size = ref.properties.filter(function (p) {
                        return /^\d+$/.test(p.name);
                    }).length;
                    desc += '[' + size + ']';
                    subtype = 'array';
                }
            } else if (ref.className === 'Date') {
                desc = new Date(ref.value || NaN).toString();
                subtype = 'date';
            } else {
                desc = ref.className || 'Object';
            }
            break;
        case 'regexp':
            type = 'object';
            subtype = 'regexp';
            desc = ref.text || '';
            /*
             We need to collect RegExp flags and append they to description,
             or open issue in NodeJS same as 'RegExp text serialized without flags'
             */
            break;
        case 'function':
            desc = ref.text || 'function()';
            break;
        case 'error':
            type = 'object';
            desc = ref.text || 'Error';
            break;
        default:
            desc = ref.text || '';
            break;
    }
    if (desc.length > 100) {
        desc = desc.substring(0, 100) + '\u2026';
    }

    objectId = ref.handle;
    if (objectId === undefined)
        objectId = ref.ref;

    inspectorResult = {
        type: type,
        subtype: subtype,
        objectId: String(objectId),
        className: ref.className,
        description: desc
    };

    return inspectorResult;
};

v8.Helper.v8ErrorToInspectorError = function (message) {
    var nameMatch = /^([^:]+):/.exec(message);

    return {
        type: 'object',
        objectId: 'ERROR',
        className: nameMatch ? nameMatch[1] : 'Error',
        description: message,
        name: nameMatch ? nameMatch[1] : 'Error',
        message: message
    };
};

v8.Helper.v8ErrorToRegularError = function (message) {
    var nameMatch = /^([^:]+):/.exec(message);

    return {
        name: nameMatch ? nameMatch[1] : 'Error',
        message: message
    };
};

v8.Helper.inspectorValueToV8Value = function (value) {
    if (value.value === undefined && value.objectId === undefined)
        return {type: 'undefined'};
    if (value.objectId) {
        return {handle: Number(value.objectId)};
    }
    return value;
};

v8.Helper.v8FunctionLookupToFunctionDetails = function (handleData) {
    return {
        details: {
            location: {
                scriptId: String(handleData.scriptId),
                lineNumber: handleData.line,
                columnNumber: handleData.column
            },
            name: handleData.name || handleData.inferredName,

            // There is a list of scope ids in responseBody.scopes, but not scope
            // details :( // We need to issue `scopes` request to fetch scopes
            // details, but we don't have frame number where the function was defined.
            // Let's leave the scopeChain empty for now.
            scopeChain: []
        }
    };
};

v8.Helper.v8ScriptIdToInspectorId = function (scriptId) {
    return String(scriptId);
};

v8.Helper.inspectorScriptIdToV8Id = function (scriptId) {
    return Number(scriptId);
};
