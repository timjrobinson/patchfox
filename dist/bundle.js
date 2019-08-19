(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';
var token = '%[a-f0-9]{2}';
var singleMatcher = new RegExp(token, 'gi');
var multiMatcher = new RegExp('(' + token + ')+', 'gi');

function decodeComponents(components, split) {
	try {
		// Try to decode the entire string first
		return decodeURIComponent(components.join(''));
	} catch (err) {
		// Do nothing
	}

	if (components.length === 1) {
		return components;
	}

	split = split || 1;

	// Split the array in 2 parts
	var left = components.slice(0, split);
	var right = components.slice(split);

	return Array.prototype.concat.call([], decodeComponents(left), decodeComponents(right));
}

function decode(input) {
	try {
		return decodeURIComponent(input);
	} catch (err) {
		var tokens = input.match(singleMatcher);

		for (var i = 1; i < tokens.length; i++) {
			input = decodeComponents(tokens, i).join('');

			tokens = input.match(singleMatcher);
		}

		return input;
	}
}

function customDecodeURIComponent(input) {
	// Keep track of all the replacements and prefill the map with the `BOM`
	var replaceMap = {
		'%FE%FF': '\uFFFD\uFFFD',
		'%FF%FE': '\uFFFD\uFFFD'
	};

	var match = multiMatcher.exec(input);
	while (match) {
		try {
			// Decode as big chunks as possible
			replaceMap[match[0]] = decodeURIComponent(match[0]);
		} catch (err) {
			var result = decode(match[0]);

			if (result !== match[0]) {
				replaceMap[match[0]] = result;
			}
		}

		match = multiMatcher.exec(input);
	}

	// Add `%C2` at the end of the map to make sure it does not replace the combinator before everything else
	replaceMap['%C2'] = '\uFFFD';

	var entries = Object.keys(replaceMap);

	for (var i = 0; i < entries.length; i++) {
		// Replace all decoded components
		var key = entries[i];
		input = input.replace(new RegExp(key, 'g'), replaceMap[key]);
	}

	return input;
}

module.exports = function (encodedURI) {
	if (typeof encodedURI !== 'string') {
		throw new TypeError('Expected `encodedURI` to be of type `string`, got `' + typeof encodedURI + '`');
	}

	try {
		encodedURI = encodedURI.replace(/\+/g, ' ');

		// Try the built in decoder first
		return decodeURIComponent(encodedURI);
	} catch (err) {
		// Fallback to a more advanced decoder
		return customDecodeURIComponent(encodedURI);
	}
};

},{}],2:[function(require,module,exports){
"use strict"

function handleDrop(callback, event) {
  event.stopPropagation()
  event.preventDefault()
  callback(Array.prototype.slice.call(event.dataTransfer.files))
}

function killEvent(e) {
  e.stopPropagation()
  e.preventDefault()
  return false
}

function addDragDropListener(element, callback) {
  element.addEventListener("dragenter", killEvent, false)
  element.addEventListener("dragover", killEvent, false)
  element.addEventListener("drop", handleDrop.bind(undefined, callback), false)
}

module.exports = addDragDropListener
},{}],3:[function(require,module,exports){
'use strict';
const strictUriEncode = require('strict-uri-encode');
const decodeComponent = require('decode-uri-component');
const splitOnFirst = require('split-on-first');

function encoderForArrayFormat(options) {
	switch (options.arrayFormat) {
		case 'index':
			return key => (result, value) => {
				const index = result.length;
				if (value === undefined) {
					return result;
				}

				if (value === null) {
					return [...result, [encode(key, options), '[', index, ']'].join('')];
				}

				return [
					...result,
					[encode(key, options), '[', encode(index, options), ']=', encode(value, options)].join('')
				];
			};

		case 'bracket':
			return key => (result, value) => {
				if (value === undefined) {
					return result;
				}

				if (value === null) {
					return [...result, [encode(key, options), '[]'].join('')];
				}

				return [...result, [encode(key, options), '[]=', encode(value, options)].join('')];
			};

		case 'comma':
			return key => (result, value, index) => {
				if (value === null || value === undefined || value.length === 0) {
					return result;
				}

				if (index === 0) {
					return [[encode(key, options), '=', encode(value, options)].join('')];
				}

				return [[result, encode(value, options)].join(',')];
			};

		default:
			return key => (result, value) => {
				if (value === undefined) {
					return result;
				}

				if (value === null) {
					return [...result, encode(key, options)];
				}

				return [...result, [encode(key, options), '=', encode(value, options)].join('')];
			};
	}
}

function parserForArrayFormat(options) {
	let result;

	switch (options.arrayFormat) {
		case 'index':
			return (key, value, accumulator) => {
				result = /\[(\d*)\]$/.exec(key);

				key = key.replace(/\[\d*\]$/, '');

				if (!result) {
					accumulator[key] = value;
					return;
				}

				if (accumulator[key] === undefined) {
					accumulator[key] = {};
				}

				accumulator[key][result[1]] = value;
			};

		case 'bracket':
			return (key, value, accumulator) => {
				result = /(\[\])$/.exec(key);
				key = key.replace(/\[\]$/, '');

				if (!result) {
					accumulator[key] = value;
					return;
				}

				if (accumulator[key] === undefined) {
					accumulator[key] = [value];
					return;
				}

				accumulator[key] = [].concat(accumulator[key], value);
			};

		case 'comma':
			return (key, value, accumulator) => {
				const isArray = typeof value === 'string' && value.split('').indexOf(',') > -1;
				const newValue = isArray ? value.split(',') : value;
				accumulator[key] = newValue;
			};

		default:
			return (key, value, accumulator) => {
				if (accumulator[key] === undefined) {
					accumulator[key] = value;
					return;
				}

				accumulator[key] = [].concat(accumulator[key], value);
			};
	}
}

function encode(value, options) {
	if (options.encode) {
		return options.strict ? strictUriEncode(value) : encodeURIComponent(value);
	}

	return value;
}

function decode(value, options) {
	if (options.decode) {
		return decodeComponent(value);
	}

	return value;
}

function keysSorter(input) {
	if (Array.isArray(input)) {
		return input.sort();
	}

	if (typeof input === 'object') {
		return keysSorter(Object.keys(input))
			.sort((a, b) => Number(a) - Number(b))
			.map(key => input[key]);
	}

	return input;
}

function removeHash(input) {
	const hashStart = input.indexOf('#');
	if (hashStart !== -1) {
		input = input.slice(0, hashStart);
	}

	return input;
}

function extract(input) {
	input = removeHash(input);
	const queryStart = input.indexOf('?');
	if (queryStart === -1) {
		return '';
	}

	return input.slice(queryStart + 1);
}

function parse(input, options) {
	options = Object.assign({
		decode: true,
		sort: true,
		arrayFormat: 'none',
		parseNumbers: false,
		parseBooleans: false
	}, options);

	const formatter = parserForArrayFormat(options);

	// Create an object with no prototype
	const ret = Object.create(null);

	if (typeof input !== 'string') {
		return ret;
	}

	input = input.trim().replace(/^[?#&]/, '');

	if (!input) {
		return ret;
	}

	for (const param of input.split('&')) {
		let [key, value] = splitOnFirst(param.replace(/\+/g, ' '), '=');

		// Missing `=` should be `null`:
		// http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
		value = value === undefined ? null : decode(value, options);

		if (options.parseNumbers && !Number.isNaN(Number(value)) && (typeof value === 'string' && value.trim() !== '')) {
			value = Number(value);
		} else if (options.parseBooleans && value !== null && (value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
			value = value.toLowerCase() === 'true';
		}

		formatter(decode(key, options), value, ret);
	}

	if (options.sort === false) {
		return ret;
	}

	return (options.sort === true ? Object.keys(ret).sort() : Object.keys(ret).sort(options.sort)).reduce((result, key) => {
		const value = ret[key];
		if (Boolean(value) && typeof value === 'object' && !Array.isArray(value)) {
			// Sort object keys, not values
			result[key] = keysSorter(value);
		} else {
			result[key] = value;
		}

		return result;
	}, Object.create(null));
}

exports.extract = extract;
exports.parse = parse;

exports.stringify = (object, options) => {
	if (!object) {
		return '';
	}

	options = Object.assign({
		encode: true,
		strict: true,
		arrayFormat: 'none'
	}, options);

	const formatter = encoderForArrayFormat(options);
	const keys = Object.keys(object);

	if (options.sort !== false) {
		keys.sort(options.sort);
	}

	return keys.map(key => {
		const value = object[key];

		if (value === undefined) {
			return '';
		}

		if (value === null) {
			return encode(key, options);
		}

		if (Array.isArray(value)) {
			return value
				.reduce(formatter(key), [])
				.join('&');
		}

		return encode(key, options) + '=' + encode(value, options);
	}).filter(x => x.length > 0).join('&');
};

exports.parseUrl = (input, options) => {
	return {
		url: removeHash(input).split('?')[0] || '',
		query: parse(extract(input), options)
	};
};

},{"decode-uri-component":1,"split-on-first":4,"strict-uri-encode":5}],4:[function(require,module,exports){
'use strict';

module.exports = (string, separator) => {
	if (!(typeof string === 'string' && typeof separator === 'string')) {
		throw new TypeError('Expected the arguments to be of type `string`');
	}

	if (separator === '') {
		return [string];
	}

	const separatorIndex = string.indexOf(separator);

	if (separatorIndex === -1) {
		return [string];
	}

	return [
		string.slice(0, separatorIndex),
		string.slice(separatorIndex + separator.length)
	];
};

},{}],5:[function(require,module,exports){
'use strict';
module.exports = str => encodeURIComponent(str).replace(/[!'()*]/g, x => `%${x.charCodeAt(0).toString(16).toUpperCase()}`);

},{}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var internal = require('../internal');

/*
Adapted from https://github.com/mattdesl
Distributed under MIT License https://github.com/mattdesl/eases/blob/master/LICENSE.md
*/
function backInOut(t) {
    const s = 1.70158 * 1.525;
    if ((t *= 2) < 1)
        return 0.5 * (t * t * ((s + 1) * t - s));
    return 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2);
}
function backIn(t) {
    const s = 1.70158;
    return t * t * ((s + 1) * t - s);
}
function backOut(t) {
    const s = 1.70158;
    return --t * t * ((s + 1) * t + s) + 1;
}
function bounceOut(t) {
    const a = 4.0 / 11.0;
    const b = 8.0 / 11.0;
    const c = 9.0 / 10.0;
    const ca = 4356.0 / 361.0;
    const cb = 35442.0 / 1805.0;
    const cc = 16061.0 / 1805.0;
    const t2 = t * t;
    return t < a
        ? 7.5625 * t2
        : t < b
            ? 9.075 * t2 - 9.9 * t + 3.4
            : t < c
                ? ca * t2 - cb * t + cc
                : 10.8 * t * t - 20.52 * t + 10.72;
}
function bounceInOut(t) {
    return t < 0.5
        ? 0.5 * (1.0 - bounceOut(1.0 - t * 2.0))
        : 0.5 * bounceOut(t * 2.0 - 1.0) + 0.5;
}
function bounceIn(t) {
    return 1.0 - bounceOut(1.0 - t);
}
function circInOut(t) {
    if ((t *= 2) < 1)
        return -0.5 * (Math.sqrt(1 - t * t) - 1);
    return 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1);
}
function circIn(t) {
    return 1.0 - Math.sqrt(1.0 - t * t);
}
function circOut(t) {
    return Math.sqrt(1 - --t * t);
}
function cubicInOut(t) {
    return t < 0.5 ? 4.0 * t * t * t : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0;
}
function cubicIn(t) {
    return t * t * t;
}
function cubicOut(t) {
    const f = t - 1.0;
    return f * f * f + 1.0;
}
function elasticInOut(t) {
    return t < 0.5
        ? 0.5 *
            Math.sin(((+13.0 * Math.PI) / 2) * 2.0 * t) *
            Math.pow(2.0, 10.0 * (2.0 * t - 1.0))
        : 0.5 *
            Math.sin(((-13.0 * Math.PI) / 2) * (2.0 * t - 1.0 + 1.0)) *
            Math.pow(2.0, -10.0 * (2.0 * t - 1.0)) +
            1.0;
}
function elasticIn(t) {
    return Math.sin((13.0 * t * Math.PI) / 2) * Math.pow(2.0, 10.0 * (t - 1.0));
}
function elasticOut(t) {
    return (Math.sin((-13.0 * (t + 1.0) * Math.PI) / 2) * Math.pow(2.0, -10.0 * t) + 1.0);
}
function expoInOut(t) {
    return t === 0.0 || t === 1.0
        ? t
        : t < 0.5
            ? +0.5 * Math.pow(2.0, 20.0 * t - 10.0)
            : -0.5 * Math.pow(2.0, 10.0 - t * 20.0) + 1.0;
}
function expoIn(t) {
    return t === 0.0 ? t : Math.pow(2.0, 10.0 * (t - 1.0));
}
function expoOut(t) {
    return t === 1.0 ? t : 1.0 - Math.pow(2.0, -10.0 * t);
}
function quadInOut(t) {
    t /= 0.5;
    if (t < 1)
        return 0.5 * t * t;
    t--;
    return -0.5 * (t * (t - 2) - 1);
}
function quadIn(t) {
    return t * t;
}
function quadOut(t) {
    return -t * (t - 2.0);
}
function quartInOut(t) {
    return t < 0.5
        ? +8.0 * Math.pow(t, 4.0)
        : -8.0 * Math.pow(t - 1.0, 4.0) + 1.0;
}
function quartIn(t) {
    return Math.pow(t, 4.0);
}
function quartOut(t) {
    return Math.pow(t - 1.0, 3.0) * (1.0 - t) + 1.0;
}
function quintInOut(t) {
    if ((t *= 2) < 1)
        return 0.5 * t * t * t * t * t;
    return 0.5 * ((t -= 2) * t * t * t * t + 2);
}
function quintIn(t) {
    return t * t * t * t * t;
}
function quintOut(t) {
    return --t * t * t * t * t + 1;
}
function sineInOut(t) {
    return -0.5 * (Math.cos(Math.PI * t) - 1);
}
function sineIn(t) {
    const v = Math.cos(t * Math.PI * 0.5);
    if (Math.abs(v) < 1e-14)
        return 1;
    else
        return 1 - v;
}
function sineOut(t) {
    return Math.sin((t * Math.PI) / 2);
}

Object.defineProperty(exports, 'linear', {
	enumerable: true,
	get: function () {
		return internal.identity;
	}
});
exports.backIn = backIn;
exports.backInOut = backInOut;
exports.backOut = backOut;
exports.bounceIn = bounceIn;
exports.bounceInOut = bounceInOut;
exports.bounceOut = bounceOut;
exports.circIn = circIn;
exports.circInOut = circInOut;
exports.circOut = circOut;
exports.cubicIn = cubicIn;
exports.cubicInOut = cubicInOut;
exports.cubicOut = cubicOut;
exports.elasticIn = elasticIn;
exports.elasticInOut = elasticInOut;
exports.elasticOut = elasticOut;
exports.expoIn = expoIn;
exports.expoInOut = expoInOut;
exports.expoOut = expoOut;
exports.quadIn = quadIn;
exports.quadInOut = quadInOut;
exports.quadOut = quadOut;
exports.quartIn = quartIn;
exports.quartInOut = quartInOut;
exports.quartOut = quartOut;
exports.quintIn = quintIn;
exports.quintInOut = quintInOut;
exports.quintOut = quintOut;
exports.sineIn = sineIn;
exports.sineInOut = sineInOut;
exports.sineOut = sineOut;

},{"../internal":8}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var internal = require('./internal');



Object.defineProperty(exports, 'afterUpdate', {
	enumerable: true,
	get: function () {
		return internal.afterUpdate;
	}
});
Object.defineProperty(exports, 'beforeUpdate', {
	enumerable: true,
	get: function () {
		return internal.beforeUpdate;
	}
});
Object.defineProperty(exports, 'createEventDispatcher', {
	enumerable: true,
	get: function () {
		return internal.createEventDispatcher;
	}
});
Object.defineProperty(exports, 'getContext', {
	enumerable: true,
	get: function () {
		return internal.getContext;
	}
});
Object.defineProperty(exports, 'onDestroy', {
	enumerable: true,
	get: function () {
		return internal.onDestroy;
	}
});
Object.defineProperty(exports, 'onMount', {
	enumerable: true,
	get: function () {
		return internal.onMount;
	}
});
Object.defineProperty(exports, 'setContext', {
	enumerable: true,
	get: function () {
		return internal.setContext;
	}
});
Object.defineProperty(exports, 'tick', {
	enumerable: true,
	get: function () {
		return internal.tick;
	}
});

},{"./internal":8}],8:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function noop() { }
const identity = x => x;
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function is_promise(value) {
    return value && typeof value === 'object' && typeof value.then === 'function';
}
function add_location(element, file, line, column, char) {
    element.__svelte_meta = {
        loc: { file, line, column, char }
    };
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function not_equal(a, b) {
    return a != a ? b == b : a !== b;
}
function validate_store(store, name) {
    if (!store || typeof store.subscribe !== 'function') {
        throw new Error(`'${name}' is not a store with a 'subscribe' method`);
    }
}
function subscribe(store, callback) {
    const unsub = store.subscribe(callback);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function get_store_value(store) {
    let value;
    subscribe(store, _ => value = _)();
    return value;
}
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}
function create_slot(definition, ctx, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, fn) {
    return definition[1]
        ? assign({}, assign(ctx.$$scope.ctx, definition[1](fn ? fn(ctx) : {})))
        : ctx.$$scope.ctx;
}
function get_slot_changes(definition, ctx, changed, fn) {
    return definition[1]
        ? assign({}, assign(ctx.$$scope.changed || {}, definition[1](fn ? fn(changed) : {})))
        : ctx.$$scope.changed || {};
}
function exclude_internal_props(props) {
    const result = {};
    for (const k in props)
        if (k[0] !== '$')
            result[k] = props[k];
    return result;
}
function once(fn) {
    let ran = false;
    return function (...args) {
        if (ran)
            return;
        ran = true;
        fn.call(this, ...args);
    };
}
function null_to_empty(value) {
    return value == null ? '' : value;
}

const is_client = typeof window !== 'undefined';
exports.now = is_client
    ? () => window.performance.now()
    : () => Date.now();
exports.raf = is_client ? cb => requestAnimationFrame(cb) : noop;
// used internally for testing
function set_now(fn) {
    exports.now = fn;
}
function set_raf(fn) {
    exports.raf = fn;
}

const tasks = new Set();
let running = false;
function run_tasks() {
    tasks.forEach(task => {
        if (!task[0](exports.now())) {
            tasks.delete(task);
            task[1]();
        }
    });
    running = tasks.size > 0;
    if (running)
        exports.raf(run_tasks);
}
function clear_loops() {
    // for testing...
    tasks.forEach(task => tasks.delete(task));
    running = false;
}
function loop(fn) {
    let task;
    if (!running) {
        running = true;
        exports.raf(run_tasks);
    }
    return {
        promise: new Promise(fulfil => {
            tasks.add(task = [fn, fulfil]);
        }),
        abort() {
            tasks.delete(task);
        }
    };
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function object_without_properties(obj, exclude) {
    // eslint-disable-next-line @typescript-eslint/no-object-literal-type-assertion
    const target = {};
    for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)
            // @ts-ignore
            && exclude.indexOf(k) === -1) {
            // @ts-ignore
            target[k] = obj[k];
        }
    }
    return target;
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function prevent_default(fn) {
    return function (event) {
        event.preventDefault();
        // @ts-ignore
        return fn.call(this, event);
    };
}
function stop_propagation(fn) {
    return function (event) {
        event.stopPropagation();
        // @ts-ignore
        return fn.call(this, event);
    };
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else
        node.setAttribute(attribute, value);
}
function set_attributes(node, attributes) {
    for (const key in attributes) {
        if (key === 'style') {
            node.style.cssText = attributes[key];
        }
        else if (key in node) {
            node[key] = attributes[key];
        }
        else {
            attr(node, key, attributes[key]);
        }
    }
}
function set_custom_element_data(node, prop, value) {
    if (prop in node) {
        node[prop] = value;
    }
    else {
        attr(node, prop, value);
    }
}
function xlink_attr(node, attribute, value) {
    node.setAttributeNS('http://www.w3.org/1999/xlink', attribute, value);
}
function get_binding_group_value(group) {
    const value = [];
    for (let i = 0; i < group.length; i += 1) {
        if (group[i].checked)
            value.push(group[i].__value);
    }
    return value;
}
function to_number(value) {
    return value === '' ? undefined : +value;
}
function time_ranges_to_array(ranges) {
    const array = [];
    for (let i = 0; i < ranges.length; i += 1) {
        array.push({ start: ranges.start(i), end: ranges.end(i) });
    }
    return array;
}
function children(element) {
    return Array.from(element.childNodes);
}
function claim_element(nodes, name, attributes, svg) {
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.nodeName === name) {
            for (let j = 0; j < node.attributes.length; j += 1) {
                const attribute = node.attributes[j];
                if (!attributes[attribute.name])
                    node.removeAttribute(attribute.name);
            }
            return nodes.splice(i, 1)[0]; // TODO strip unwanted attributes
        }
    }
    return svg ? svg_element(name) : element(name);
}
function claim_text(nodes, data) {
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.nodeType === 3) {
            node.data = data;
            return nodes.splice(i, 1)[0];
        }
    }
    return text(data);
}
function set_data(text, data) {
    data = '' + data;
    if (text.data !== data)
        text.data = data;
}
function set_input_type(input, type) {
    try {
        input.type = type;
    }
    catch (e) {
        // do nothing
    }
}
function set_style(node, key, value) {
    node.style.setProperty(key, value);
}
function select_option(select, value) {
    for (let i = 0; i < select.options.length; i += 1) {
        const option = select.options[i];
        if (option.__value === value) {
            option.selected = true;
            return;
        }
    }
}
function select_options(select, value) {
    for (let i = 0; i < select.options.length; i += 1) {
        const option = select.options[i];
        option.selected = ~value.indexOf(option.__value);
    }
}
function select_value(select) {
    const selected_option = select.querySelector(':checked') || select.options[0];
    return selected_option && selected_option.__value;
}
function select_multiple_value(select) {
    return [].map.call(select.querySelectorAll(':checked'), option => option.__value);
}
function add_resize_listener(element, fn) {
    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }
    const object = document.createElement('object');
    object.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%; overflow: hidden; pointer-events: none; z-index: -1;');
    object.type = 'text/html';
    object.tabIndex = -1;
    let win;
    object.onload = () => {
        win = object.contentDocument.defaultView;
        win.addEventListener('resize', fn);
    };
    if (/Trident/.test(navigator.userAgent)) {
        element.appendChild(object);
        object.data = 'about:blank';
    }
    else {
        object.data = 'about:blank';
        element.appendChild(object);
    }
    return {
        cancel: () => {
            win && win.removeEventListener && win.removeEventListener('resize', fn);
            element.removeChild(object);
        }
    };
}
function toggle_class(element, name, toggle) {
    element.classList[toggle ? 'add' : 'remove'](name);
}
function custom_event(type, detail) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, false, false, detail);
    return e;
}
class HtmlTag {
    constructor(html, anchor = null) {
        this.e = element('div');
        this.a = anchor;
        this.u(html);
    }
    m(target, anchor = null) {
        for (let i = 0; i < this.n.length; i += 1) {
            insert(target, this.n[i], anchor);
        }
        this.t = target;
    }
    u(html) {
        this.e.innerHTML = html;
        this.n = Array.from(this.e.childNodes);
    }
    p(html) {
        this.d();
        this.u(html);
        this.m(this.t, this.a);
    }
    d() {
        this.n.forEach(detach);
    }
}

let stylesheet;
let active = 0;
let current_rules = {};
// https://github.com/darkskyapp/string-hash/blob/master/index.js
function hash(str) {
    let hash = 5381;
    let i = str.length;
    while (i--)
        hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
    return hash >>> 0;
}
function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
    const step = 16.666 / duration;
    let keyframes = '{\n';
    for (let p = 0; p <= 1; p += step) {
        const t = a + (b - a) * ease(p);
        keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
    }
    const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
    const name = `__svelte_${hash(rule)}_${uid}`;
    if (!current_rules[name]) {
        if (!stylesheet) {
            const style = element('style');
            document.head.appendChild(style);
            stylesheet = style.sheet;
        }
        current_rules[name] = true;
        stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
    }
    const animation = node.style.animation || '';
    node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
    active += 1;
    return name;
}
function delete_rule(node, name) {
    node.style.animation = (node.style.animation || '')
        .split(', ')
        .filter(name
        ? anim => anim.indexOf(name) < 0 // remove specific animation
        : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
    )
        .join(', ');
    if (name && !--active)
        clear_rules();
}
function clear_rules() {
    exports.raf(() => {
        if (active)
            return;
        let i = stylesheet.cssRules.length;
        while (i--)
            stylesheet.deleteRule(i);
        current_rules = {};
    });
}

function create_animation(node, from, fn, params) {
    if (!from)
        return noop;
    const to = node.getBoundingClientRect();
    if (from.left === to.left && from.right === to.right && from.top === to.top && from.bottom === to.bottom)
        return noop;
    const { delay = 0, duration = 300, easing = identity, 
    // @ts-ignore todo: should this be separated from destructuring? Or start/end added to public api and documentation?
    start: start_time = exports.now() + delay, 
    // @ts-ignore todo:
    end = start_time + duration, tick = noop, css } = fn(node, { from, to }, params);
    let running = true;
    let started = false;
    let name;
    function start() {
        if (css) {
            name = create_rule(node, 0, 1, duration, delay, easing, css);
        }
        if (!delay) {
            started = true;
        }
    }
    function stop() {
        if (css)
            delete_rule(node, name);
        running = false;
    }
    loop(now => {
        if (!started && now >= start_time) {
            started = true;
        }
        if (started && now >= end) {
            tick(1, 0);
            stop();
        }
        if (!running) {
            return false;
        }
        if (started) {
            const p = now - start_time;
            const t = 0 + 1 * easing(p / duration);
            tick(t, 1 - t);
        }
        return true;
    });
    start();
    tick(0, 1);
    return stop;
}
function fix_position(node) {
    const style = getComputedStyle(node);
    if (style.position !== 'absolute' && style.position !== 'fixed') {
        const { width, height } = style;
        const a = node.getBoundingClientRect();
        node.style.position = 'absolute';
        node.style.width = width;
        node.style.height = height;
        add_transform(node, a);
    }
}
function add_transform(node, a) {
    const b = node.getBoundingClientRect();
    if (a.left !== b.left || a.top !== b.top) {
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        node.style.transform = `${transform} translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    }
}

function set_current_component(component) {
    exports.current_component = component;
}
function get_current_component() {
    if (!exports.current_component)
        throw new Error(`Function called outside component initialization`);
    return exports.current_component;
}
function beforeUpdate(fn) {
    get_current_component().$$.before_update.push(fn);
}
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
function afterUpdate(fn) {
    get_current_component().$$.after_update.push(fn);
}
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}
function createEventDispatcher() {
    const component = exports.current_component;
    return (type, detail) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail);
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
        }
    };
}
function setContext(key, context) {
    get_current_component().$$.context.set(key, context);
}
function getContext(key) {
    return get_current_component().$$.context.get(key);
}
// TODO figure out if we still want to support
// shorthand events, or if we want to implement
// a real bubbling mechanism
function bubble(component, event) {
    const callbacks = component.$$.callbacks[event.type];
    if (callbacks) {
        callbacks.slice().forEach(fn => fn(event));
    }
}

const dirty_components = [];
const intros = { enabled: false };
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function tick() {
    schedule_update();
    return resolved_promise;
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
function add_flush_callback(fn) {
    flush_callbacks.push(fn);
}
function flush() {
    const seen_callbacks = new Set();
    do {
        // first, call beforeUpdate functions
        // and update components
        while (dirty_components.length) {
            const component = dirty_components.shift();
            set_current_component(component);
            update(component.$$);
        }
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                callback();
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
}
function update($$) {
    if ($$.fragment) {
        $$.update($$.dirty);
        run_all($$.before_update);
        $$.fragment.p($$.dirty, $$.ctx);
        $$.dirty = null;
        $$.after_update.forEach(add_render_callback);
    }
}

let promise;
function wait() {
    if (!promise) {
        promise = Promise.resolve();
        promise.then(() => {
            promise = null;
        });
    }
    return promise;
}
function dispatch(node, direction, kind) {
    node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
}
const null_transition = { duration: 0 };
function create_in_transition(node, fn, params) {
    let config = fn(node, params);
    let running = false;
    let animation_name;
    let task;
    let uid = 0;
    function cleanup() {
        if (animation_name)
            delete_rule(node, animation_name);
    }
    function go() {
        const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
        if (css)
            animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
        tick(0, 1);
        const start_time = exports.now() + delay;
        const end_time = start_time + duration;
        if (task)
            task.abort();
        running = true;
        add_render_callback(() => dispatch(node, true, 'start'));
        task = loop(now => {
            if (running) {
                if (now >= end_time) {
                    tick(1, 0);
                    dispatch(node, true, 'end');
                    cleanup();
                    return running = false;
                }
                if (now >= start_time) {
                    const t = easing((now - start_time) / duration);
                    tick(t, 1 - t);
                }
            }
            return running;
        });
    }
    let started = false;
    return {
        start() {
            if (started)
                return;
            delete_rule(node);
            if (is_function(config)) {
                config = config();
                wait().then(go);
            }
            else {
                go();
            }
        },
        invalidate() {
            started = false;
        },
        end() {
            if (running) {
                cleanup();
                running = false;
            }
        }
    };
}
function create_out_transition(node, fn, params) {
    let config = fn(node, params);
    let running = true;
    let animation_name;
    const group = outros;
    group.r += 1;
    function go() {
        const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
        if (css)
            animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
        const start_time = exports.now() + delay;
        const end_time = start_time + duration;
        add_render_callback(() => dispatch(node, false, 'start'));
        loop(now => {
            if (running) {
                if (now >= end_time) {
                    tick(0, 1);
                    dispatch(node, false, 'end');
                    if (!--group.r) {
                        // this will result in `end()` being called,
                        // so we don't need to clean up here
                        run_all(group.c);
                    }
                    return false;
                }
                if (now >= start_time) {
                    const t = easing((now - start_time) / duration);
                    tick(1 - t, t);
                }
            }
            return running;
        });
    }
    if (is_function(config)) {
        wait().then(() => {
            // @ts-ignore
            config = config();
            go();
        });
    }
    else {
        go();
    }
    return {
        end(reset) {
            if (reset && config.tick) {
                config.tick(1, 0);
            }
            if (running) {
                if (animation_name)
                    delete_rule(node, animation_name);
                running = false;
            }
        }
    };
}
function create_bidirectional_transition(node, fn, params, intro) {
    let config = fn(node, params);
    let t = intro ? 0 : 1;
    let running_program = null;
    let pending_program = null;
    let animation_name = null;
    function clear_animation() {
        if (animation_name)
            delete_rule(node, animation_name);
    }
    function init(program, duration) {
        const d = program.b - t;
        duration *= Math.abs(d);
        return {
            a: t,
            b: program.b,
            d,
            duration,
            start: program.start,
            end: program.start + duration,
            group: program.group
        };
    }
    function go(b) {
        const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
        const program = {
            start: exports.now() + delay,
            b
        };
        if (!b) {
            // @ts-ignore todo: improve typings
            program.group = outros;
            outros.r += 1;
        }
        if (running_program) {
            pending_program = program;
        }
        else {
            // if this is an intro, and there's a delay, we need to do
            // an initial tick and/or apply CSS animation immediately
            if (css) {
                clear_animation();
                animation_name = create_rule(node, t, b, duration, delay, easing, css);
            }
            if (b)
                tick(0, 1);
            running_program = init(program, duration);
            add_render_callback(() => dispatch(node, b, 'start'));
            loop(now => {
                if (pending_program && now > pending_program.start) {
                    running_program = init(pending_program, duration);
                    pending_program = null;
                    dispatch(node, running_program.b, 'start');
                    if (css) {
                        clear_animation();
                        animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                    }
                }
                if (running_program) {
                    if (now >= running_program.end) {
                        tick(t = running_program.b, 1 - t);
                        dispatch(node, running_program.b, 'end');
                        if (!pending_program) {
                            // we're done
                            if (running_program.b) {
                                // intro — we can tidy up immediately
                                clear_animation();
                            }
                            else {
                                // outro — needs to be coordinated
                                if (!--running_program.group.r)
                                    run_all(running_program.group.c);
                            }
                        }
                        running_program = null;
                    }
                    else if (now >= running_program.start) {
                        const p = now - running_program.start;
                        t = running_program.a + running_program.d * easing(p / running_program.duration);
                        tick(t, 1 - t);
                    }
                }
                return !!(running_program || pending_program);
            });
        }
    }
    return {
        run(b) {
            if (is_function(config)) {
                wait().then(() => {
                    // @ts-ignore
                    config = config();
                    go(b);
                });
            }
            else {
                go(b);
            }
        },
        end() {
            clear_animation();
            running_program = pending_program = null;
        }
    };
}

function handle_promise(promise, info) {
    const token = info.token = {};
    function update(type, index, key, value) {
        if (info.token !== token)
            return;
        info.resolved = key && { [key]: value };
        const child_ctx = assign(assign({}, info.ctx), info.resolved);
        const block = type && (info.current = type)(child_ctx);
        if (info.block) {
            if (info.blocks) {
                info.blocks.forEach((block, i) => {
                    if (i !== index && block) {
                        group_outros();
                        transition_out(block, 1, 1, () => {
                            info.blocks[i] = null;
                        });
                        check_outros();
                    }
                });
            }
            else {
                info.block.d(1);
            }
            block.c();
            transition_in(block, 1);
            block.m(info.mount(), info.anchor);
            flush();
        }
        info.block = block;
        if (info.blocks)
            info.blocks[index] = block;
    }
    if (is_promise(promise)) {
        promise.then(value => {
            update(info.then, 1, info.value, value);
        }, error => {
            update(info.catch, 2, info.error, error);
        });
        // if we previously had a then/catch block, destroy it
        if (info.current !== info.pending) {
            update(info.pending, 0);
            return true;
        }
    }
    else {
        if (info.current !== info.then) {
            update(info.then, 1, info.value, promise);
            return true;
        }
        info.resolved = { [info.value]: promise };
    }
}

const globals = (typeof window !== 'undefined' ? window : global);

function destroy_block(block, lookup) {
    block.d(1);
    lookup.delete(block.key);
}
function outro_and_destroy_block(block, lookup) {
    transition_out(block, 1, 1, () => {
        lookup.delete(block.key);
    });
}
function fix_and_destroy_block(block, lookup) {
    block.f();
    destroy_block(block, lookup);
}
function fix_and_outro_and_destroy_block(block, lookup) {
    block.f();
    outro_and_destroy_block(block, lookup);
}
function update_keyed_each(old_blocks, changed, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
    let o = old_blocks.length;
    let n = list.length;
    let i = o;
    const old_indexes = {};
    while (i--)
        old_indexes[old_blocks[i].key] = i;
    const new_blocks = [];
    const new_lookup = new Map();
    const deltas = new Map();
    i = n;
    while (i--) {
        const child_ctx = get_context(ctx, list, i);
        const key = get_key(child_ctx);
        let block = lookup.get(key);
        if (!block) {
            block = create_each_block(key, child_ctx);
            block.c();
        }
        else if (dynamic) {
            block.p(changed, child_ctx);
        }
        new_lookup.set(key, new_blocks[i] = block);
        if (key in old_indexes)
            deltas.set(key, Math.abs(i - old_indexes[key]));
    }
    const will_move = new Set();
    const did_move = new Set();
    function insert(block) {
        transition_in(block, 1);
        block.m(node, next);
        lookup.set(block.key, block);
        next = block.first;
        n--;
    }
    while (o && n) {
        const new_block = new_blocks[n - 1];
        const old_block = old_blocks[o - 1];
        const new_key = new_block.key;
        const old_key = old_block.key;
        if (new_block === old_block) {
            // do nothing
            next = new_block.first;
            o--;
            n--;
        }
        else if (!new_lookup.has(old_key)) {
            // remove old block
            destroy(old_block, lookup);
            o--;
        }
        else if (!lookup.has(new_key) || will_move.has(new_key)) {
            insert(new_block);
        }
        else if (did_move.has(old_key)) {
            o--;
        }
        else if (deltas.get(new_key) > deltas.get(old_key)) {
            did_move.add(new_key);
            insert(new_block);
        }
        else {
            will_move.add(old_key);
            o--;
        }
    }
    while (o--) {
        const old_block = old_blocks[o];
        if (!new_lookup.has(old_block.key))
            destroy(old_block, lookup);
    }
    while (n)
        insert(new_blocks[n - 1]);
    return new_blocks;
}
function measure(blocks) {
    const rects = {};
    let i = blocks.length;
    while (i--)
        rects[blocks[i].key] = blocks[i].node.getBoundingClientRect();
    return rects;
}

function get_spread_update(levels, updates) {
    const update = {};
    const to_null_out = {};
    const accounted_for = { $$scope: 1 };
    let i = levels.length;
    while (i--) {
        const o = levels[i];
        const n = updates[i];
        if (n) {
            for (const key in o) {
                if (!(key in n))
                    to_null_out[key] = 1;
            }
            for (const key in n) {
                if (!accounted_for[key]) {
                    update[key] = n[key];
                    accounted_for[key] = 1;
                }
            }
            levels[i] = n;
        }
        else {
            for (const key in o) {
                accounted_for[key] = 1;
            }
        }
    }
    for (const key in to_null_out) {
        if (!(key in update))
            update[key] = undefined;
    }
    return update;
}

const invalid_attribute_name_character = /[\s'">/=\u{FDD0}-\u{FDEF}\u{FFFE}\u{FFFF}\u{1FFFE}\u{1FFFF}\u{2FFFE}\u{2FFFF}\u{3FFFE}\u{3FFFF}\u{4FFFE}\u{4FFFF}\u{5FFFE}\u{5FFFF}\u{6FFFE}\u{6FFFF}\u{7FFFE}\u{7FFFF}\u{8FFFE}\u{8FFFF}\u{9FFFE}\u{9FFFF}\u{AFFFE}\u{AFFFF}\u{BFFFE}\u{BFFFF}\u{CFFFE}\u{CFFFF}\u{DFFFE}\u{DFFFF}\u{EFFFE}\u{EFFFF}\u{FFFFE}\u{FFFFF}\u{10FFFE}\u{10FFFF}]/u;
// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
// https://infra.spec.whatwg.org/#noncharacter
function spread(args) {
    const attributes = Object.assign({}, ...args);
    let str = '';
    Object.keys(attributes).forEach(name => {
        if (invalid_attribute_name_character.test(name))
            return;
        const value = attributes[name];
        if (value === undefined)
            return;
        if (value === true)
            str += " " + name;
        const escaped = String(value)
            .replace(/"/g, '&#34;')
            .replace(/'/g, '&#39;');
        str += " " + name + "=" + JSON.stringify(escaped);
    });
    return str;
}
const escaped = {
    '"': '&quot;',
    "'": '&#39;',
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
};
function escape(html) {
    return String(html).replace(/["'&<>]/g, match => escaped[match]);
}
function each(items, fn) {
    let str = '';
    for (let i = 0; i < items.length; i += 1) {
        str += fn(items[i], i);
    }
    return str;
}
const missing_component = {
    $$render: () => ''
};
function validate_component(component, name) {
    if (!component || !component.$$render) {
        if (name === 'svelte:component')
            name += ' this={...}';
        throw new Error(`<${name}> is not a valid SSR component. You may need to review your build config to ensure that dependencies are compiled, rather than imported as pre-compiled modules`);
    }
    return component;
}
function debug(file, line, column, values) {
    console.log(`{@debug} ${file ? file + ' ' : ''}(${line}:${column})`); // eslint-disable-line no-console
    console.log(values); // eslint-disable-line no-console
    return '';
}
let on_destroy;
function create_ssr_component(fn) {
    function $$render(result, props, bindings, slots) {
        const parent_component = exports.current_component;
        const $$ = {
            on_destroy,
            context: new Map(parent_component ? parent_component.$$.context : []),
            // these will be immediately discarded
            on_mount: [],
            before_update: [],
            after_update: [],
            callbacks: blank_object()
        };
        set_current_component({ $$ });
        const html = fn(result, props, bindings, slots);
        set_current_component(parent_component);
        return html;
    }
    return {
        render: (props = {}, options = {}) => {
            on_destroy = [];
            const result = { head: '', css: new Set() };
            const html = $$render(result, props, {}, options);
            run_all(on_destroy);
            return {
                html,
                css: {
                    code: Array.from(result.css).map(css => css.code).join('\n'),
                    map: null // TODO
                },
                head: result.head
            };
        },
        $$render
    };
}
function add_attribute(name, value, boolean) {
    if (value == null || (boolean && !value))
        return '';
    return ` ${name}${value === true ? '' : `=${typeof value === 'string' ? JSON.stringify(escape(value)) : `"${value}"`}`}`;
}
function add_classes(classes) {
    return classes ? ` class="${classes}"` : ``;
}

function bind(component, name, callback) {
    if (component.$$.props.indexOf(name) === -1)
        return;
    component.$$.bound[name] = callback;
    callback(component.$$.ctx[name]);
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    if (component.$$.fragment) {
        run_all(component.$$.on_destroy);
        component.$$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        component.$$.on_destroy = component.$$.fragment = null;
        component.$$.ctx = {};
    }
}
function make_dirty(component, key) {
    if (!component.$$.dirty) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty = blank_object();
    }
    component.$$.dirty[key] = true;
}
function init(component, options, instance, create_fragment, not_equal, prop_names) {
    const parent_component = exports.current_component;
    set_current_component(component);
    const props = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props: prop_names,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty: null
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, props, (key, value) => {
            if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                if ($$.bound[key])
                    $$.bound[key](value);
                if (ready)
                    make_dirty(component, key);
            }
        })
        : props;
    $$.update();
    ready = true;
    run_all($$.before_update);
    $$.fragment = create_fragment($$.ctx);
    if (options.target) {
        if (options.hydrate) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment.l(children(options.target));
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
if (typeof HTMLElement !== 'undefined') {
    exports.SvelteElement = class extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
        }
        connectedCallback() {
            // @ts-ignore todo: improve typings
            for (const key in this.$$.slotted) {
                // @ts-ignore todo: improve typings
                this.appendChild(this.$$.slotted[key]);
            }
        }
        attributeChangedCallback(attr, _oldValue, newValue) {
            this[attr] = newValue;
        }
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            // TODO should this delegate to addEventListener?
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    };
}
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set() {
        // overridden by instance, if it has props
    }
}
class SvelteComponentDev extends SvelteComponent {
    constructor(options) {
        if (!options || (!options.target && !options.$$inline)) {
            throw new Error(`'target' is a required option`);
        }
        super();
    }
    $destroy() {
        super.$destroy();
        this.$destroy = () => {
            console.warn(`Component was already destroyed`); // eslint-disable-line no-console
        };
    }
}

exports.HtmlTag = HtmlTag;
exports.SvelteComponent = SvelteComponent;
exports.SvelteComponentDev = SvelteComponentDev;
exports.add_attribute = add_attribute;
exports.add_classes = add_classes;
exports.add_flush_callback = add_flush_callback;
exports.add_location = add_location;
exports.add_render_callback = add_render_callback;
exports.add_resize_listener = add_resize_listener;
exports.add_transform = add_transform;
exports.afterUpdate = afterUpdate;
exports.append = append;
exports.assign = assign;
exports.attr = attr;
exports.beforeUpdate = beforeUpdate;
exports.bind = bind;
exports.binding_callbacks = binding_callbacks;
exports.blank_object = blank_object;
exports.bubble = bubble;
exports.check_outros = check_outros;
exports.children = children;
exports.claim_element = claim_element;
exports.claim_text = claim_text;
exports.clear_loops = clear_loops;
exports.component_subscribe = component_subscribe;
exports.createEventDispatcher = createEventDispatcher;
exports.create_animation = create_animation;
exports.create_bidirectional_transition = create_bidirectional_transition;
exports.create_in_transition = create_in_transition;
exports.create_out_transition = create_out_transition;
exports.create_slot = create_slot;
exports.create_ssr_component = create_ssr_component;
exports.custom_event = custom_event;
exports.debug = debug;
exports.destroy_block = destroy_block;
exports.destroy_component = destroy_component;
exports.destroy_each = destroy_each;
exports.detach = detach;
exports.dirty_components = dirty_components;
exports.each = each;
exports.element = element;
exports.empty = empty;
exports.escape = escape;
exports.escaped = escaped;
exports.exclude_internal_props = exclude_internal_props;
exports.fix_and_destroy_block = fix_and_destroy_block;
exports.fix_and_outro_and_destroy_block = fix_and_outro_and_destroy_block;
exports.fix_position = fix_position;
exports.flush = flush;
exports.getContext = getContext;
exports.get_binding_group_value = get_binding_group_value;
exports.get_slot_changes = get_slot_changes;
exports.get_slot_context = get_slot_context;
exports.get_spread_update = get_spread_update;
exports.get_store_value = get_store_value;
exports.globals = globals;
exports.group_outros = group_outros;
exports.handle_promise = handle_promise;
exports.identity = identity;
exports.init = init;
exports.insert = insert;
exports.intros = intros;
exports.invalid_attribute_name_character = invalid_attribute_name_character;
exports.is_client = is_client;
exports.is_function = is_function;
exports.is_promise = is_promise;
exports.listen = listen;
exports.loop = loop;
exports.measure = measure;
exports.missing_component = missing_component;
exports.mount_component = mount_component;
exports.noop = noop;
exports.not_equal = not_equal;
exports.null_to_empty = null_to_empty;
exports.object_without_properties = object_without_properties;
exports.onDestroy = onDestroy;
exports.onMount = onMount;
exports.once = once;
exports.outro_and_destroy_block = outro_and_destroy_block;
exports.prevent_default = prevent_default;
exports.run = run;
exports.run_all = run_all;
exports.safe_not_equal = safe_not_equal;
exports.schedule_update = schedule_update;
exports.select_multiple_value = select_multiple_value;
exports.select_option = select_option;
exports.select_options = select_options;
exports.select_value = select_value;
exports.setContext = setContext;
exports.set_attributes = set_attributes;
exports.set_current_component = set_current_component;
exports.set_custom_element_data = set_custom_element_data;
exports.set_data = set_data;
exports.set_input_type = set_input_type;
exports.set_now = set_now;
exports.set_raf = set_raf;
exports.set_style = set_style;
exports.space = space;
exports.spread = spread;
exports.stop_propagation = stop_propagation;
exports.subscribe = subscribe;
exports.svg_element = svg_element;
exports.text = text;
exports.tick = tick;
exports.time_ranges_to_array = time_ranges_to_array;
exports.to_number = to_number;
exports.toggle_class = toggle_class;
exports.transition_in = transition_in;
exports.transition_out = transition_out;
exports.update_keyed_each = update_keyed_each;
exports.validate_component = validate_component;
exports.validate_store = validate_store;
exports.xlink_attr = xlink_attr;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var internal = require('../internal');

const subscriber_queue = [];
/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
function readable(value, start) {
    return {
        subscribe: writable(value, start).subscribe,
    };
}
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = internal.noop) {
    let stop;
    const subscribers = [];
    function set(new_value) {
        if (internal.safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (let i = 0; i < subscribers.length; i += 1) {
                    const s = subscribers[i];
                    s[1]();
                    subscriber_queue.push(s, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = internal.noop) {
        const subscriber = [run, invalidate];
        subscribers.push(subscriber);
        if (subscribers.length === 1) {
            stop = start(set) || internal.noop;
        }
        run(value);
        return () => {
            const index = subscribers.indexOf(subscriber);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
            if (subscribers.length === 0) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}
/**
 * Derived value store by synchronizing one or more readable stores and
 * applying an aggregation function over its input values.
 * @param {Stores} stores input stores
 * @param {function(Stores=, function(*)=):*}fn function callback that aggregates the values
 * @param {*=}initial_value when used asynchronously
 */
function derived(stores, fn, initial_value) {
    const single = !Array.isArray(stores);
    const stores_array = single
        ? [stores]
        : stores;
    const auto = fn.length < 2;
    return readable(initial_value, (set) => {
        let inited = false;
        const values = [];
        let pending = 0;
        let cleanup = internal.noop;
        const sync = () => {
            if (pending) {
                return;
            }
            cleanup();
            const result = fn(single ? values[0] : values, set);
            if (auto) {
                set(result);
            }
            else {
                cleanup = internal.is_function(result) ? result : internal.noop;
            }
        };
        const unsubscribers = stores_array.map((store, i) => store.subscribe((value) => {
            values[i] = value;
            pending &= ~(1 << i);
            if (inited) {
                sync();
            }
        }, () => {
            pending |= (1 << i);
        }));
        inited = true;
        sync();
        return function stop() {
            internal.run_all(unsubscribers);
            cleanup();
        };
    });
}

Object.defineProperty(exports, 'get', {
	enumerable: true,
	get: function () {
		return internal.get_store_value;
	}
});
exports.derived = derived;
exports.readable = readable;
exports.writable = writable;

},{"../internal":8}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var easing = require('../easing');
var internal = require('../internal');

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function fade(node, { delay = 0, duration = 400 }) {
    const o = +getComputedStyle(node).opacity;
    return {
        delay,
        duration,
        css: t => `opacity: ${t * o}`
    };
}
function fly(node, { delay = 0, duration = 400, easing: easing$1 = easing.cubicOut, x = 0, y = 0, opacity = 0 }) {
    const style = getComputedStyle(node);
    const target_opacity = +style.opacity;
    const transform = style.transform === 'none' ? '' : style.transform;
    const od = target_opacity * (1 - opacity);
    return {
        delay,
        duration,
        easing: easing$1,
        css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
    };
}
function slide(node, { delay = 0, duration = 400, easing: easing$1 = easing.cubicOut }) {
    const style = getComputedStyle(node);
    const opacity = +style.opacity;
    const height = parseFloat(style.height);
    const padding_top = parseFloat(style.paddingTop);
    const padding_bottom = parseFloat(style.paddingBottom);
    const margin_top = parseFloat(style.marginTop);
    const margin_bottom = parseFloat(style.marginBottom);
    const border_top_width = parseFloat(style.borderTopWidth);
    const border_bottom_width = parseFloat(style.borderBottomWidth);
    return {
        delay,
        duration,
        easing: easing$1,
        css: t => `overflow: hidden;` +
            `opacity: ${Math.min(t * 20, 1) * opacity};` +
            `height: ${t * height}px;` +
            `padding-top: ${t * padding_top}px;` +
            `padding-bottom: ${t * padding_bottom}px;` +
            `margin-top: ${t * margin_top}px;` +
            `margin-bottom: ${t * margin_bottom}px;` +
            `border-top-width: ${t * border_top_width}px;` +
            `border-bottom-width: ${t * border_bottom_width}px;`
    };
}
function scale(node, { delay = 0, duration = 400, easing: easing$1 = easing.cubicOut, start = 0, opacity = 0 }) {
    const style = getComputedStyle(node);
    const target_opacity = +style.opacity;
    const transform = style.transform === 'none' ? '' : style.transform;
    const sd = 1 - start;
    const od = target_opacity * (1 - opacity);
    return {
        delay,
        duration,
        easing: easing$1,
        css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
    };
}
function draw(node, { delay = 0, speed, duration, easing: easing$1 = easing.cubicInOut }) {
    const len = node.getTotalLength();
    if (duration === undefined) {
        if (speed === undefined) {
            duration = 800;
        }
        else {
            duration = len / speed;
        }
    }
    else if (typeof duration === 'function') {
        duration = duration(len);
    }
    return {
        delay,
        duration,
        easing: easing$1,
        css: (t, u) => `stroke-dasharray: ${t * len} ${u * len}`
    };
}
function crossfade(_a) {
    var { fallback } = _a, defaults = __rest(_a, ["fallback"]);
    const to_receive = new Map();
    const to_send = new Map();
    function crossfade(from, node, params) {
        const { delay = 0, duration = d => Math.sqrt(d) * 30, easing: easing$1 = easing.cubicOut } = internal.assign(internal.assign({}, defaults), params);
        const to = node.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        const dw = from.width / to.width;
        const dh = from.height / to.height;
        const d = Math.sqrt(dx * dx + dy * dy);
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        const opacity = +style.opacity;
        return {
            delay,
            duration: internal.is_function(duration) ? duration(d) : duration,
            easing: easing$1,
            css: (t, u) => `
				opacity: ${t * opacity};
				transform-origin: top left;
				transform: ${transform} translate(${u * dx}px,${u * dy}px) scale(${t + (1 - t) * dw}, ${t + (1 - t) * dh});
			`
        };
    }
    function transition(items, counterparts, intro) {
        return (node, params) => {
            items.set(params.key, {
                rect: node.getBoundingClientRect()
            });
            return () => {
                if (counterparts.has(params.key)) {
                    const { rect } = counterparts.get(params.key);
                    counterparts.delete(params.key);
                    return crossfade(rect, node, params);
                }
                // if the node is disappearing altogether
                // (i.e. wasn't claimed by the other list)
                // then we need to supply an outro
                items.delete(params.key);
                return fallback && fallback(node, params, intro);
            };
        };
    }
    return [
        transition(to_send, to_receive, false),
        transition(to_receive, to_send, true)
    ];
}

exports.crossfade = crossfade;
exports.draw = draw;
exports.fade = fade;
exports.fly = fly;
exports.scale = scale;
exports.slide = slide;

},{"../easing":6,"../internal":8}],11:[function(require,module,exports){
var timeago = function(){};

timeago.prototype.simple = function(date_time) {
    // today date and time in milliseconds 
    var today = Date.now();
    var dateParse = Date.parse(date_time);
    
    //We will perform some test - if there is error, we will throw error to console and exit, no change will be on the data.
    try {
        // We need to check if we able to parse the Date (if the result is NaN, this is an issue)
        if(dateParse !== dateParse) throw "timeago-simple: Please check date and time format! Unable to parse the date & time: " + date_time;
    }
    catch(err) {
        console.error(err);
        return (date_time);
    }
    
    if((dateParse - today) < 0) {
		return pastCalc(date_time);
	} else {
		return futureCalc(date_time);
	}
};


// General help functions for time calculations
function pastCalc(timeData){

    // today date and time in milliseconds 
    var today = Date.now();
        
    // parsing post date and time into milliseconds format
    timeData = Date.parse(timeData);

    var seconds = (today - timeData) / 1000;
    var minutes = (seconds / 60);
    var hours = (seconds / 3600);
    if(seconds < 60 && minutes < 1) {
        return (seconds === 1 ? Math.round(seconds) + " second ago" : Math.round(seconds) + " seconds ago");
    }
    if(minutes < 60 && hours < 1) {
        return (minutes === 1 ? Math.round(minutes) + " minute ago" : Math.round(minutes) + " minutes ago");
    }
    if(hours > 24){
        var days = hours / 24;
        if (days > 30) {
            var month = days / 30;
            if (month > 12) {
                var years = month / 12;
                if (years > 0) {
                    return (years === 1 ? Math.ceil(years) + " year ago" : Math.ceil(years) + " years ago");
                }
            }
            return (Math.round(month) + " month ago");
        }
        return (days === 1 ? Math.round(days) + " day ago" : Math.round(days) + " days ago");
    } else {
        return (hours === 1 ? Math.round(hours) + " hour ago" : Math.round(hours) + " hours ago");
    }
        
}

function futureCalc(timeData){

    // today date and time in milliseconds 
    var today = Date.now();
     
    // parsing post date and time into milliseconds format
    timeData = Date.parse(timeData);
    var seconds = (timeData - today) / 1000;
    var minutes = (seconds / 60);
    var hours = (seconds / 3600);
    if(seconds < 60 && minutes < 1) {
        return (seconds === 1 ? "in " + Math.round(seconds) + " second" : "in " + Math.round(seconds) + " seconds");
    }
    if(minutes < 60 && hours < 1) {
        return (minutes === 1 ? "in " + Math.round(minutes) + " minute" : "in " + Math.round(minutes) + " minutes");
    }
    if(hours > 24){
        var days = hours / 24;
        if (days > 30) {
            var month = days / 30;
            if (month > 12) {
                var years = month / 12;
                if (years > 0) {
                    return (years === 1 ? "in " + Math.ceil(years) + " year" : "in " + Math.ceil(years) + " years"); 
                }
            }
           return ("in " + Math.round(month) + " month"); 
        }
        return (days === 1 ? "in " + Math.round(days) + " day" : "in " + Math.round(days) + " days");
    } else {
        return (hours === 1 ? "in " + Math.round(hours) + " hour" : "in " + Math.round(hours) + " hours");
    }
}

// Future calculation
timeago.prototype.future = function(timeData) {
    console.warn("timeago-simple: .future function is depricated! Please use .simple for both past and future dates.");
    // today date and time in milliseconds 
    var today = Date.now();

    //We will perform some test - if there is error, we will throw error to console and exit, no change will be on the data.
    try {
        // We need to check if we able to parse the Date (if the result is NaN, this is an issue)
        if(Date.parse(timeData) !== Date.parse(timeData)) throw "timeago-simple: Please check date and time format! Unable to parse the date & time: " + timeData;
        // Need to check if it's really future date to parse
        if((Date.parse(timeData) - today) < 0) throw "timeago-simple: Looks like it's more relevant case for timeago.simple"; 
    }
    catch(err) {
        console.error(err);
        return (timeData);
    }
  
    // parsing post date and time into milliseconds format
    timeData = Date.parse(timeData);
    var seconds = (timeData - today) / 1000;
    var minutes = (seconds / 60);
    var hours = (seconds / 3600);
    /* istanbul ignore if */
    if(seconds < 60 && minutes < 1) {
        return (seconds === 1 ? "in " + Math.round(seconds) + " second" : "in " + Math.round(seconds) + " seconds");
    }
    /* istanbul ignore if */
    if(minutes < 60 && hours < 1) {
    	return (minutes === 1 ? "in " + Math.round(minutes) + " minute" : "in " + Math.round(minutes) + " minutes");
    }
    /* istanbul ignore if */
    if(hours > 24){
        var days = hours / 24;
        if (days > 30) {
            var month = days / 30;
            if (month > 12) {
                var years = month / 12;
                if (years > 0) {
                    return (years === 1 ? "in " + Math.ceil(years) + " year" : "in " + Math.ceil(years) + " years");
                }
            }
	        return ("in " + Math.round(month) + " month");
        }
        return (days === 1 ? "in " + Math.round(days) + " day" : "in " + Math.round(days) + " days");
    }
    return (hours === 1 ? "in " + Math.round(hours) + " hour" : "in " + Math.round(hours) + " hours");
};


module.exports = new timeago();
},{}],12:[function(require,module,exports){
/* Navigation.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	component_subscribe,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	prevent_default,
	run_all,
	safe_not_equal,
	space,
	stop_propagation,
	text,
	validate_store
} = require("svelte/internal");

const file = "Navigation.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-1avaaxb-style';
	style.textContent = ".blocker.svelte-1avaaxb{height:70px;display:block}.above.svelte-1avaaxb{z-index:99999;width:100;padding:5px;position:fixed}.current.svelte-1avaaxb{border:none;background:none;border-bottom:solid 2px rgb(2, 146, 50);outline:none}.throw-things-to-the-right.svelte-1avaaxb{width:100%;text-align:right}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmF2aWdhdGlvbi5zdmVsdGUiLCJzb3VyY2VzIjpbIk5hdmlnYXRpb24uc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XHJcbiAgY29uc3Qge1xyXG4gICAgY29ubmVjdGVkLFxyXG4gICAgbmF2aWdhdGUsXHJcbiAgICByb3V0ZUxvY2F0aW9uLFxyXG4gICAgaW50ZXJjZXB0XHJcbiAgfSA9IHJlcXVpcmUoXCIuL3V0aWxzLmpzXCIpO1xyXG5cclxuICBsZXQgYXZhdGFyID0gXCIvaW1hZ2VzL2ljb24ucG5nXCI7XHJcblxyXG4gIGxldCBxdWVyeSA9IFwiXCI7XHJcblxyXG4gICQ6IGlmICgkY29ubmVjdGVkKSB7XHJcbiAgICBzc2IuYXZhdGFyKHNzYi5mZWVkKS50aGVuKGRhdGEgPT4ge1xyXG4gICAgICBhdmF0YXIgPSBgaHR0cDovL2xvY2FsaG9zdDo4OTg5L2Jsb2JzL2dldC8ke2RhdGEuaW1hZ2V9YDtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZ29TZXR0aW5ncyA9IGV2ID0+IG5hdmlnYXRlKFwiL3NldHRpbmdzXCIpO1xyXG4gIGNvbnN0IGdvQ29tcG9zZSA9ICgpID0+IG5hdmlnYXRlKFwiL2NvbXBvc2UvcG9zdFwiKTtcclxuICBjb25zdCBnb0NvbXBvc2VCbG9nID0gKCkgPT4gbmF2aWdhdGUoXCIvY29tcG9zZS9ibG9nXCIpO1xyXG4gIGNvbnN0IGdvUHVibGljID0gKCkgPT4gbmF2aWdhdGUoXCIvcHVibGljXCIpO1xyXG4gIGNvbnN0IGdvQ2hhbm5lbHMgPSAoKSA9PiBuYXZpZ2F0ZShcIi9jaGFubmVsc1wiKTtcclxuICBjb25zdCBnb01lbnRpb25zID0gKCkgPT4gbmF2aWdhdGUoXCIvbWVudGlvbnNcIik7XHJcblxyXG4gIGNvbnN0IGdvU2VhcmNoID0gKCkgPT4ge1xyXG4gICAgbGV0IGMgPSBxdWVyeVswXTtcclxuICAgIGlmIChjID09PSBcIiNcIiB8fCBjID09PSBcIkBcIiB8fCBjID09PSBcIiZcIikge1xyXG4gICAgICBuYXZpZ2F0ZShcIi9pbnRlcmNlcHRcIiwgeyBxdWVyeSB9KTtcclxuICAgICAgaW50ZXJjZXB0KCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBuYXZpZ2F0ZShcIi9zZWFyY2hcIiwgeyBxdWVyeSB9KTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBvcGVuU2lkZWJhciA9IGFzeW5jIGV2ID0+IHtcclxuICAgIGxldCBsb2MgPSB3aW5kb3cubG9jYXRpb24uaHJlZjtcclxuICAgIGJyb3dzZXIuc2lkZWJhckFjdGlvbi5zZXRQYW5lbCh7IHBhbmVsOiBsb2MgfSk7XHJcbiAgICBicm93c2VyLnNpZGViYXJBY3Rpb24ub3BlbigpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGNsb3NlU2lkZWJhciA9IGFzeW5jIGV2ID0+IHtcclxuICAgIGxldCBsb2MgPSBhd2FpdCBicm93c2VyLnNpZGViYXJBY3Rpb24uZ2V0UGFuZWwoe30pO1xyXG4gICAgYXdhaXQgYnJvd3Nlci50YWJzLmNyZWF0ZSh7IHVybDogbG9jIH0pO1xyXG4gICAgYXdhaXQgYnJvd3Nlci5zaWRlYmFyQWN0aW9uLmNsb3NlKCk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3Qgb3Blbk15UHJvZmlsZSA9IGV2ID0+IHtcclxuICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuXHJcbiAgICBpZiAoc3NiLmZlZWQpIHtcclxuICAgICAgbmF2aWdhdGUoXCIvcHJvZmlsZVwiLCB7IGZlZWQ6IHNzYi5mZWVkIH0pO1xyXG4gICAgfVxyXG4gIH07XHJcbjwvc2NyaXB0PlxyXG5cclxuPHN0eWxlPlxyXG4gIC5ibG9ja2VyIHtcclxuICAgIGhlaWdodDogNzBweDtcclxuICAgIGRpc3BsYXk6IGJsb2NrO1xyXG4gIH1cclxuXHJcbiAgLmFib3ZlIHtcclxuICAgIHotaW5kZXg6IDk5OTk5O1xyXG4gICAgd2lkdGg6IDEwMDtcclxuICAgIHBhZGRpbmc6IDVweDtcclxuICAgIHBvc2l0aW9uOiBmaXhlZDtcclxuICB9XHJcblxyXG4gIC5jdXJyZW50IHtcclxuICAgIGJvcmRlcjogbm9uZTtcclxuICAgIGJhY2tncm91bmQ6IG5vbmU7XHJcbiAgICBib3JkZXItYm90dG9tOiBzb2xpZCAycHggcmdiKDIsIDE0NiwgNTApO1xyXG4gICAgb3V0bGluZTogbm9uZTtcclxuICB9XHJcblxyXG4gIC50aHJvdy10aGluZ3MtdG8tdGhlLXJpZ2h0IHtcclxuICAgIHdpZHRoOiAxMDAlO1xyXG4gICAgdGV4dC1hbGlnbjogcmlnaHQ7XHJcbiAgfVxyXG48L3N0eWxlPlxyXG5cclxuPGhlYWRlciBjbGFzcz1cIm5hdmJhclwiPlxyXG4gIDxzZWN0aW9uIGNsYXNzPVwibmF2YmFyLXNlY3Rpb24gaGlkZS1zbVwiPlxyXG4gICAgPGEgaHJlZj1cIiMvc2lkZWJhclwiIGNsYXNzPVwiYnRuIGJ0bi1saW5rXCIgb246Y2xpY2s9e29wZW5TaWRlYmFyfT5cclxuICAgICAgPGkgY2xhc3M9XCJpY29uIGljb24tbWludXMgdGV4dC1ibGFja1wiIC8+XHJcbiAgICA8L2E+XHJcbiAgICA8YSBocmVmPVwiIy9wcm9maWxlXCIgY2xhc3M9XCJuYXZiYXItYnJhbmQgbXItMiBwLTFcIiBvbjpjbGljaz17b3Blbk15UHJvZmlsZX0+XHJcbiAgICAgIDxmaWd1cmUgY2xhc3M9XCJhdmF0YXIgYXZhdGFyLWxnXCI+XHJcbiAgICAgICAgPGltZyBzcmM9e2F2YXRhcn0gYWx0PVwiTFwiIC8+XHJcbiAgICAgICAgPGkgY2xhc3M9XCJhdmF0YXItcHJlc2VuY2UgeyRjb25uZWN0ZWQgPyAnb25saW5lJyA6ICdvZmZsaW5lJ31cIiAvPlxyXG4gICAgICA8L2ZpZ3VyZT5cclxuICAgIDwvYT5cclxuICAgIDxkaXYgY2xhc3M9XCJkcm9wZG93blwiPlxyXG4gICAgICA8YSBocmVmPVwiIy9jb21wb3NlXCIgY2xhc3M9XCJidG4gYnRuLWxpbmsgZHJvcGRvd24tdG9nZ2xlXCIgdGFiaW5kZXg9XCIwXCI+XHJcbiAgICAgICAgQ29tcG9zZVxyXG4gICAgICAgIDxpIGNsYXNzPVwiaWNvbiBpY29uLWNhcmV0XCIgLz5cclxuICAgICAgPC9hPlxyXG4gICAgICA8dWwgY2xhc3M9XCJtZW51XCI+XHJcbiAgICAgICAgPGxpIGNsYXNzPVwibWVudS1pdGVtXCI+XHJcbiAgICAgICAgICA8YVxyXG4gICAgICAgICAgICBocmVmPVwiIy9jb21wb3NlL3Bvc3RcIlxyXG4gICAgICAgICAgICBjbGFzcz1cImJ0biBidG4tbGlua1wiXHJcbiAgICAgICAgICAgIG9uOmNsaWNrfHN0b3BQcm9wYWdhdGlvbnxwcmV2ZW50RGVmYXVsdD17Z29Db21wb3NlfT5cclxuICAgICAgICAgICAgTmV3IFBvc3RcclxuICAgICAgICAgIDwvYT5cclxuICAgICAgICA8L2xpPlxyXG4gICAgICAgIDxsaSBjbGFzcz1cIm1lbnUtaXRlbVwiPlxyXG4gICAgICAgICAgPGFcclxuICAgICAgICAgICAgaHJlZj1cIiMvY29tcG9zZS9ibG9nXCJcclxuICAgICAgICAgICAgY2xhc3M9XCJidG4gYnRuLWxpbmtcIlxyXG4gICAgICAgICAgICBvbjpjbGlja3xzdG9wUHJvcGFnYXRpb258cHJldmVudERlZmF1bHQ9e2dvQ29tcG9zZUJsb2d9PlxyXG4gICAgICAgICAgICBOZXcgQmxvZyBQb3N0XHJcbiAgICAgICAgICA8L2E+XHJcbiAgICAgICAgPC9saT5cclxuICAgICAgPC91bD5cclxuICAgIDwvZGl2PlxyXG4gICAgPGFcclxuICAgICAgaHJlZj1cIiMvcHVibGljXCJcclxuICAgICAgY2xhc3M9XCJidG4gYnRuLWxpbmtcIlxyXG4gICAgICBvbjpjbGlja3xzdG9wUHJvcGFnYXRpb258cHJldmVudERlZmF1bHQ9e2dvUHVibGljfT5cclxuICAgICAgUHVibGljXHJcbiAgICA8L2E+XHJcbiAgICA8YVxyXG4gICAgICBocmVmPVwiIy9tZW50aW9uc1wiXHJcbiAgICAgIGNsYXNzPVwiYnRuIGJ0bi1saW5rXCJcclxuICAgICAgb246Y2xpY2t8c3RvcFByb3BhZ2F0aW9ufHByZXZlbnREZWZhdWx0PXtnb01lbnRpb25zfT5cclxuICAgICAgTWVudGlvbnNcclxuICAgIDwvYT5cclxuICAgIDxhXHJcbiAgICAgIGhyZWY9XCIjL2NoYW5uZWxzXCJcclxuICAgICAgY2xhc3M9XCJidG4gYnRuLWxpbmtcIlxyXG4gICAgICBvbjpjbGlja3xzdG9wUHJvcGFnYXRpb258cHJldmVudERlZmF1bHQ9e2dvQ2hhbm5lbHN9PlxyXG4gICAgICBDaGFubmVsc1xyXG4gICAgPC9hPlxyXG4gICAgPGEgaHJlZj1cIiMvc2V0dGluZ3NcIiBjbGFzcz1cImJ0biBidG4tbGlua1wiIG9uOmNsaWNrPXtnb1NldHRpbmdzfT5TZXR0aW5nczwvYT5cclxuICAgIDxhIGhyZWY9XCIvZG9jcy9pbmRleC5odG1sXCIgY2xhc3M9XCJidG4gYnRuLWxpbmtcIj5IZWxwPC9hPlxyXG4gIDwvc2VjdGlvbj5cclxuICA8c2VjdGlvbiBjbGFzcz1cIm5hdmJhci1jZW50ZXJcIiAvPlxyXG4gIDxzZWN0aW9uIGNsYXNzPVwibmF2YmFyLXNlY3Rpb24gaGlkZS1zbVwiPlxyXG4gICAgPGRpdiBjbGFzcz1cInRocm93LXRoaW5ncy10by10aGUtcmlnaHRcIj5cclxuICAgICAgPGRpdiBjbGFzcz1cImlucHV0LWdyb3VwIGlucHV0LWlubGluZVwiPlxyXG4gICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgY2xhc3M9XCJmb3JtLWlucHV0XCJcclxuICAgICAgICAgIHR5cGU9XCJ0ZXh0XCJcclxuICAgICAgICAgIGJpbmQ6dmFsdWU9e3F1ZXJ5fVxyXG4gICAgICAgICAgcGxhY2Vob2xkZXI9XCJDaGFubmVsIG9yIEZlZWQgSURcIiAvPlxyXG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgaW5wdXQtZ3JvdXAtYnRuXCIgb246Y2xpY2s9e2dvU2VhcmNofT5cclxuICAgICAgICAgIEdvXHJcbiAgICAgICAgPC9idXR0b24+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgPC9zZWN0aW9uPlxyXG4gIDxzZWN0aW9uIGNsYXNzPVwibmF2YmFyLXNlY3Rpb24gc2hvdy1zbSBiZy1ncmF5IGFib3ZlXCI+XHJcbiAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1saW5rXCIgb246Y2xpY2s9eygpID0+IGhpc3RvcnkuYmFjaygpfT5cclxuICAgICAgPGkgY2xhc3M9XCJpY29uIGljb24tYmFja1wiIC8+XHJcbiAgICA8L2J1dHRvbj5cclxuICAgIDxhIGhyZWY9XCIuLi5cIiBjbGFzcz1cIm5hdmJhci1icmFuZCBtci0yIHAtMVwiPlxyXG4gICAgICA8ZmlndXJlIGNsYXNzPVwiYXZhdGFyXCI+XHJcbiAgICAgICAgPGltZyBzcmM9e2F2YXRhcn0gYWx0PVwiTFwiIC8+XHJcbiAgICAgICAgPGkgY2xhc3M9XCJhdmF0YXItcHJlc2VuY2UgeyRjb25uZWN0ZWQgPyAnb25saW5lJyA6ICdvZmZsaW5lJ31cIiAvPlxyXG4gICAgICA8L2ZpZ3VyZT5cclxuICAgIDwvYT5cclxuICAgIDxkaXYgY2xhc3M9XCJkcm9wZG93biBmbG9hdC1yaWdodFwiPlxyXG4gICAgICA8YVxyXG4gICAgICAgIGhyZWY9XCI/XCJcclxuICAgICAgICBjbGFzcz1cImJ0biBidG4tbGluayBkcm9wZG93bi10b2dnbGVcIlxyXG4gICAgICAgIHRhYmluZGV4PVwiMFwiXHJcbiAgICAgICAgb246Y2xpY2t8c3RvcFByb3BhZ2F0aW9ufHByZXZlbnREZWZhdWx0PXsoKSA9PiAnJ30+XHJcbiAgICAgICAgTWVudVxyXG4gICAgICAgIDxpIGNsYXNzPVwiaWNvbiBpY29uLWNhcmV0XCIgLz5cclxuICAgICAgPC9hPlxyXG4gICAgICA8IS0tIG1lbnUgY29tcG9uZW50IC0tPlxyXG4gICAgICA8dWwgY2xhc3M9XCJtZW51XCI+XHJcbiAgICAgICAgPGxpIGNsYXNzPVwibWVudS1pdGVtXCI+XHJcbiAgICAgICAgICA8YVxyXG4gICAgICAgICAgICBocmVmPVwiIy9jb21wb3NlXCJcclxuICAgICAgICAgICAgY2xhc3M9XCJidG4gYnRuLWxpbmtcIlxyXG4gICAgICAgICAgICBvbjpjbGlja3xzdG9wUHJvcGFnYXRpb258cHJldmVudERlZmF1bHQ9e2dvQ29tcG9zZX0+XHJcbiAgICAgICAgICAgIENvbXBvc2VcclxuICAgICAgICAgIDwvYT5cclxuICAgICAgICA8L2xpPlxyXG4gICAgICAgIDxsaSBjbGFzcz1cIm1lbnUtaXRlbVwiPlxyXG4gICAgICAgICAgPGFcclxuICAgICAgICAgICAgaHJlZj1cIiMvcHVibGljXCJcclxuICAgICAgICAgICAgY2xhc3M9XCJidG4gYnRuLWxpbmtcIlxyXG4gICAgICAgICAgICBvbjpjbGlja3xzdG9wUHJvcGFnYXRpb258cHJldmVudERlZmF1bHQ9e2dvUHVibGljfT5cclxuICAgICAgICAgICAgUHVibGljXHJcbiAgICAgICAgICA8L2E+XHJcbiAgICAgICAgPC9saT5cclxuICAgICAgICA8bGkgY2xhc3M9XCJtZW51LWl0ZW1cIj5cclxuICAgICAgICAgIDxhXHJcbiAgICAgICAgICAgIGhyZWY9XCIjL2NoYW5uZWxzXCJcclxuICAgICAgICAgICAgY2xhc3M9XCJidG4gYnRuLWxpbmtcIlxyXG4gICAgICAgICAgICBvbjpjbGlja3xzdG9wUHJvcGFnYXRpb258cHJldmVudERlZmF1bHQ9e2dvQ2hhbm5lbHN9PlxyXG4gICAgICAgICAgICBDaGFubmVsc1xyXG4gICAgICAgICAgPC9hPlxyXG4gICAgICAgIDwvbGk+XHJcbiAgICAgICAgPGxpIGNsYXNzPVwibWVudS1pdGVtXCI+XHJcbiAgICAgICAgICA8YVxyXG4gICAgICAgICAgICBocmVmPVwiIy9tZW50aW9uc1wiXHJcbiAgICAgICAgICAgIGNsYXNzPVwiYnRuIGJ0bi1saW5rXCJcclxuICAgICAgICAgICAgb246Y2xpY2t8c3RvcFByb3BhZ2F0aW9ufHByZXZlbnREZWZhdWx0PXtnb01lbnRpb25zfT5cclxuICAgICAgICAgICAgTWVudGlvbnNcclxuICAgICAgICAgIDwvYT5cclxuICAgICAgICA8L2xpPlxyXG4gICAgICAgIDxsaSBjbGFzcz1cIm1lbnUtaXRlbVwiPlxyXG4gICAgICAgICAgPGEgaHJlZj1cIiMvc2V0dGluZ3NcIiBjbGFzcz1cImJ0biBidG4tbGlua1wiIG9uOmNsaWNrPXtnb1NldHRpbmdzfT5cclxuICAgICAgICAgICAgU2V0dGluZ3NcclxuICAgICAgICAgIDwvYT5cclxuICAgICAgICA8L2xpPlxyXG4gICAgICAgIDxsaSBjbGFzcz1cIm1lbnUtaXRlbVwiPlxyXG4gICAgICAgICAgPGEgaHJlZj1cIi9kb2NzL2luZGV4Lmh0bWxcIiBjbGFzcz1cImJ0biBidG4tbGlua1wiPkhlbHA8L2E+XHJcbiAgICAgICAgPC9saT5cclxuICAgICAgICA8bGkgY2xhc3M9XCJtZW51LWl0ZW1cIj5cclxuICAgICAgICAgIDxhIGhyZWY9XCIjL3NpZGViYXJcIiBjbGFzcz1cImJ0biBidG4tbGlua1wiIG9uOmNsaWNrPXtjbG9zZVNpZGViYXJ9PlxyXG4gICAgICAgICAgICBPcGVuIGFzIGEgVGFiXHJcbiAgICAgICAgICA8L2E+XHJcbiAgICAgICAgPC9saT5cclxuICAgICAgPC91bD5cclxuICAgIDwvZGl2PlxyXG4gIDwvc2VjdGlvbj5cclxuICA8ZGl2IGNsYXNzPVwiYmxvY2tlciBzaG93LXNtXCIgLz5cclxuPC9oZWFkZXI+XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUEwREUsUUFBUSxlQUFDLENBQUMsQUFDUixNQUFNLENBQUUsSUFBSSxDQUNaLE9BQU8sQ0FBRSxLQUFLLEFBQ2hCLENBQUMsQUFFRCxNQUFNLGVBQUMsQ0FBQyxBQUNOLE9BQU8sQ0FBRSxLQUFLLENBQ2QsS0FBSyxDQUFFLEdBQUcsQ0FDVixPQUFPLENBQUUsR0FBRyxDQUNaLFFBQVEsQ0FBRSxLQUFLLEFBQ2pCLENBQUMsQUFFRCxRQUFRLGVBQUMsQ0FBQyxBQUNSLE1BQU0sQ0FBRSxJQUFJLENBQ1osVUFBVSxDQUFFLElBQUksQ0FDaEIsYUFBYSxDQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FDeEMsT0FBTyxDQUFFLElBQUksQUFDZixDQUFDLEFBRUQsMEJBQTBCLGVBQUMsQ0FBQyxBQUMxQixLQUFLLENBQUUsSUFBSSxDQUNYLFVBQVUsQ0FBRSxLQUFLLEFBQ25CLENBQUMifQ== */";
	append(document.head, style);
}

function create_fragment(ctx) {
	var header, section0, a0, i0, t0, a1, figure0, img0, t1, i1, i1_class_value, t2, div0, a2, t3, i2, t4, ul0, li0, a3, t6, li1, a4, t8, a5, t10, a6, t12, a7, t14, a8, t16, a9, t18, section1, t19, section2, div2, div1, input, t20, button0, t22, section3, button1, i3, t23, a10, figure1, img1, t24, i4, i4_class_value, t25, div3, a11, t26, i5, t27, ul1, li2, a12, t29, li3, a13, t31, li4, a14, t33, li5, a15, t35, li6, a16, t37, li7, a17, t39, li8, a18, t41, div4, dispose;

	return {
		c: function create() {
			header = element("header");
			section0 = element("section");
			a0 = element("a");
			i0 = element("i");
			t0 = space();
			a1 = element("a");
			figure0 = element("figure");
			img0 = element("img");
			t1 = space();
			i1 = element("i");
			t2 = space();
			div0 = element("div");
			a2 = element("a");
			t3 = text("Compose\r\n        ");
			i2 = element("i");
			t4 = space();
			ul0 = element("ul");
			li0 = element("li");
			a3 = element("a");
			a3.textContent = "New Post";
			t6 = space();
			li1 = element("li");
			a4 = element("a");
			a4.textContent = "New Blog Post";
			t8 = space();
			a5 = element("a");
			a5.textContent = "Public";
			t10 = space();
			a6 = element("a");
			a6.textContent = "Mentions";
			t12 = space();
			a7 = element("a");
			a7.textContent = "Channels";
			t14 = space();
			a8 = element("a");
			a8.textContent = "Settings";
			t16 = space();
			a9 = element("a");
			a9.textContent = "Help";
			t18 = space();
			section1 = element("section");
			t19 = space();
			section2 = element("section");
			div2 = element("div");
			div1 = element("div");
			input = element("input");
			t20 = space();
			button0 = element("button");
			button0.textContent = "Go";
			t22 = space();
			section3 = element("section");
			button1 = element("button");
			i3 = element("i");
			t23 = space();
			a10 = element("a");
			figure1 = element("figure");
			img1 = element("img");
			t24 = space();
			i4 = element("i");
			t25 = space();
			div3 = element("div");
			a11 = element("a");
			t26 = text("Menu\r\n        ");
			i5 = element("i");
			t27 = space();
			ul1 = element("ul");
			li2 = element("li");
			a12 = element("a");
			a12.textContent = "Compose";
			t29 = space();
			li3 = element("li");
			a13 = element("a");
			a13.textContent = "Public";
			t31 = space();
			li4 = element("li");
			a14 = element("a");
			a14.textContent = "Channels";
			t33 = space();
			li5 = element("li");
			a15 = element("a");
			a15.textContent = "Mentions";
			t35 = space();
			li6 = element("li");
			a16 = element("a");
			a16.textContent = "Settings";
			t37 = space();
			li7 = element("li");
			a17 = element("a");
			a17.textContent = "Help";
			t39 = space();
			li8 = element("li");
			a18 = element("a");
			a18.textContent = "Open as a Tab";
			t41 = space();
			div4 = element("div");
			attr(i0, "class", "icon icon-minus text-black");
			add_location(i0, file, 86, 6, 1946);
			attr(a0, "href", "#/sidebar");
			attr(a0, "class", "btn btn-link");
			add_location(a0, file, 85, 4, 1874);
			attr(img0, "src", ctx.avatar);
			attr(img0, "alt", "L");
			add_location(img0, file, 90, 8, 2128);
			attr(i1, "class", i1_class_value = "avatar-presence " + (ctx.$connected ? 'online' : 'offline') + " svelte-1avaaxb");
			add_location(i1, file, 91, 8, 2166);
			attr(figure0, "class", "avatar avatar-lg");
			add_location(figure0, file, 89, 6, 2085);
			attr(a1, "href", "#/profile");
			attr(a1, "class", "navbar-brand mr-2 p-1");
			add_location(a1, file, 88, 4, 2002);
			attr(i2, "class", "icon icon-caret");
			add_location(i2, file, 97, 8, 2391);
			attr(a2, "href", "#/compose");
			attr(a2, "class", "btn btn-link dropdown-toggle");
			attr(a2, "tabindex", "0");
			add_location(a2, file, 95, 6, 2294);
			attr(a3, "href", "#/compose/post");
			attr(a3, "class", "btn btn-link");
			add_location(a3, file, 101, 10, 2501);
			attr(li0, "class", "menu-item");
			add_location(li0, file, 100, 8, 2467);
			attr(a4, "href", "#/compose/blog");
			attr(a4, "class", "btn btn-link");
			add_location(a4, file, 109, 10, 2735);
			attr(li1, "class", "menu-item");
			add_location(li1, file, 108, 8, 2701);
			attr(ul0, "class", "menu");
			add_location(ul0, file, 99, 6, 2440);
			attr(div0, "class", "dropdown");
			add_location(div0, file, 94, 4, 2264);
			attr(a5, "href", "#/public");
			attr(a5, "class", "btn btn-link");
			add_location(a5, file, 118, 4, 2965);
			attr(a6, "href", "#/mentions");
			attr(a6, "class", "btn btn-link");
			add_location(a6, file, 124, 4, 3107);
			attr(a7, "href", "#/channels");
			attr(a7, "class", "btn btn-link");
			add_location(a7, file, 130, 4, 3255);
			attr(a8, "href", "#/settings");
			attr(a8, "class", "btn btn-link");
			add_location(a8, file, 136, 4, 3403);
			attr(a9, "href", "/docs/index.html");
			attr(a9, "class", "btn btn-link");
			add_location(a9, file, 137, 4, 3485);
			attr(section0, "class", "navbar-section hide-sm");
			add_location(section0, file, 84, 2, 1828);
			attr(section1, "class", "navbar-center");
			add_location(section1, file, 139, 2, 3559);
			attr(input, "class", "form-input");
			attr(input, "type", "text");
			attr(input, "placeholder", "Channel or Feed ID");
			add_location(input, file, 143, 8, 3737);
			attr(button0, "class", "btn btn-primary input-group-btn");
			add_location(button0, file, 148, 8, 3883);
			attr(div1, "class", "input-group input-inline");
			add_location(div1, file, 142, 6, 3689);
			attr(div2, "class", "throw-things-to-the-right svelte-1avaaxb");
			add_location(div2, file, 141, 4, 3642);
			attr(section2, "class", "navbar-section hide-sm");
			add_location(section2, file, 140, 2, 3596);
			attr(i3, "class", "icon icon-back");
			add_location(i3, file, 156, 6, 4157);
			attr(button1, "class", "btn btn-link");
			add_location(button1, file, 155, 4, 4088);
			attr(img1, "src", ctx.avatar);
			attr(img1, "alt", "L");
			add_location(img1, file, 160, 8, 4291);
			attr(i4, "class", i4_class_value = "avatar-presence " + (ctx.$connected ? 'online' : 'offline') + " svelte-1avaaxb");
			add_location(i4, file, 161, 8, 4329);
			attr(figure1, "class", "avatar");
			add_location(figure1, file, 159, 6, 4258);
			attr(a10, "href", "...");
			attr(a10, "class", "navbar-brand mr-2 p-1");
			add_location(a10, file, 158, 4, 4206);
			attr(i5, "class", "icon icon-caret");
			add_location(i5, file, 171, 8, 4642);
			attr(a11, "href", "?");
			attr(a11, "class", "btn btn-link dropdown-toggle");
			attr(a11, "tabindex", "0");
			add_location(a11, file, 165, 6, 4469);
			attr(a12, "href", "#/compose");
			attr(a12, "class", "btn btn-link");
			add_location(a12, file, 176, 10, 4783);
			attr(li2, "class", "menu-item");
			add_location(li2, file, 175, 8, 4749);
			attr(a13, "href", "#/public");
			attr(a13, "class", "btn btn-link");
			add_location(a13, file, 184, 10, 5011);
			attr(li3, "class", "menu-item");
			add_location(li3, file, 183, 8, 4977);
			attr(a14, "href", "#/channels");
			attr(a14, "class", "btn btn-link");
			add_location(a14, file, 192, 10, 5236);
			attr(li4, "class", "menu-item");
			add_location(li4, file, 191, 8, 5202);
			attr(a15, "href", "#/mentions");
			attr(a15, "class", "btn btn-link");
			add_location(a15, file, 200, 10, 5467);
			attr(li5, "class", "menu-item");
			add_location(li5, file, 199, 8, 5433);
			attr(a16, "href", "#/settings");
			attr(a16, "class", "btn btn-link");
			add_location(a16, file, 208, 10, 5698);
			attr(li6, "class", "menu-item");
			add_location(li6, file, 207, 8, 5664);
			attr(a17, "href", "/docs/index.html");
			attr(a17, "class", "btn btn-link");
			add_location(a17, file, 213, 10, 5859);
			attr(li7, "class", "menu-item");
			add_location(li7, file, 212, 8, 5825);
			attr(a18, "href", "#/sidebar");
			attr(a18, "class", "btn btn-link");
			add_location(a18, file, 216, 10, 5974);
			attr(li8, "class", "menu-item");
			add_location(li8, file, 215, 8, 5940);
			attr(ul1, "class", "menu");
			add_location(ul1, file, 174, 6, 4722);
			attr(div3, "class", "dropdown float-right");
			add_location(div3, file, 164, 4, 4427);
			attr(section3, "class", "navbar-section show-sm bg-gray above svelte-1avaaxb");
			add_location(section3, file, 154, 2, 4028);
			attr(div4, "class", "blocker show-sm svelte-1avaaxb");
			add_location(div4, file, 223, 2, 6140);
			attr(header, "class", "navbar");
			add_location(header, file, 83, 0, 1801);

			dispose = [
				listen(a0, "click", ctx.openSidebar),
				listen(a1, "click", ctx.openMyProfile),
				listen(a3, "click", stop_propagation(prevent_default(ctx.goCompose))),
				listen(a4, "click", stop_propagation(prevent_default(ctx.goComposeBlog))),
				listen(a5, "click", stop_propagation(prevent_default(ctx.goPublic))),
				listen(a6, "click", stop_propagation(prevent_default(ctx.goMentions))),
				listen(a7, "click", stop_propagation(prevent_default(ctx.goChannels))),
				listen(a8, "click", ctx.goSettings),
				listen(input, "input", ctx.input_input_handler),
				listen(button0, "click", ctx.goSearch),
				listen(button1, "click", click_handler),
				listen(a11, "click", stop_propagation(prevent_default(click_handler_1))),
				listen(a12, "click", stop_propagation(prevent_default(ctx.goCompose))),
				listen(a13, "click", stop_propagation(prevent_default(ctx.goPublic))),
				listen(a14, "click", stop_propagation(prevent_default(ctx.goChannels))),
				listen(a15, "click", stop_propagation(prevent_default(ctx.goMentions))),
				listen(a16, "click", ctx.goSettings),
				listen(a18, "click", ctx.closeSidebar)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, header, anchor);
			append(header, section0);
			append(section0, a0);
			append(a0, i0);
			append(section0, t0);
			append(section0, a1);
			append(a1, figure0);
			append(figure0, img0);
			append(figure0, t1);
			append(figure0, i1);
			append(section0, t2);
			append(section0, div0);
			append(div0, a2);
			append(a2, t3);
			append(a2, i2);
			append(div0, t4);
			append(div0, ul0);
			append(ul0, li0);
			append(li0, a3);
			append(ul0, t6);
			append(ul0, li1);
			append(li1, a4);
			append(section0, t8);
			append(section0, a5);
			append(section0, t10);
			append(section0, a6);
			append(section0, t12);
			append(section0, a7);
			append(section0, t14);
			append(section0, a8);
			append(section0, t16);
			append(section0, a9);
			append(header, t18);
			append(header, section1);
			append(header, t19);
			append(header, section2);
			append(section2, div2);
			append(div2, div1);
			append(div1, input);

			input.value = ctx.query;

			append(div1, t20);
			append(div1, button0);
			append(header, t22);
			append(header, section3);
			append(section3, button1);
			append(button1, i3);
			append(section3, t23);
			append(section3, a10);
			append(a10, figure1);
			append(figure1, img1);
			append(figure1, t24);
			append(figure1, i4);
			append(section3, t25);
			append(section3, div3);
			append(div3, a11);
			append(a11, t26);
			append(a11, i5);
			append(div3, t27);
			append(div3, ul1);
			append(ul1, li2);
			append(li2, a12);
			append(ul1, t29);
			append(ul1, li3);
			append(li3, a13);
			append(ul1, t31);
			append(ul1, li4);
			append(li4, a14);
			append(ul1, t33);
			append(ul1, li5);
			append(li5, a15);
			append(ul1, t35);
			append(ul1, li6);
			append(li6, a16);
			append(ul1, t37);
			append(ul1, li7);
			append(li7, a17);
			append(ul1, t39);
			append(ul1, li8);
			append(li8, a18);
			append(header, t41);
			append(header, div4);
		},

		p: function update(changed, ctx) {
			if (changed.avatar) {
				attr(img0, "src", ctx.avatar);
			}

			if ((changed.$connected) && i1_class_value !== (i1_class_value = "avatar-presence " + (ctx.$connected ? 'online' : 'offline') + " svelte-1avaaxb")) {
				attr(i1, "class", i1_class_value);
			}

			if (changed.query && (input.value !== ctx.query)) input.value = ctx.query;

			if (changed.avatar) {
				attr(img1, "src", ctx.avatar);
			}

			if ((changed.$connected) && i4_class_value !== (i4_class_value = "avatar-presence " + (ctx.$connected ? 'online' : 'offline') + " svelte-1avaaxb")) {
				attr(i4, "class", i4_class_value);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(header);
			}

			run_all(dispose);
		}
	};
}

function click_handler() {
	return history.back();
}

function click_handler_1() {
	return '';
}

function instance($$self, $$props, $$invalidate) {
	let $connected;

	const {
    connected,
    navigate,
    routeLocation,
    intercept
  } = require("./utils.js"); validate_store(connected, 'connected'); component_subscribe($$self, connected, $$value => { $connected = $$value; $$invalidate('$connected', $connected) });

  let avatar = "/images/icon.png";

  let query = "";

  const goSettings = ev => navigate("/settings");
  const goCompose = () => navigate("/compose/post");
  const goComposeBlog = () => navigate("/compose/blog");
  const goPublic = () => navigate("/public");
  const goChannels = () => navigate("/channels");
  const goMentions = () => navigate("/mentions");

  const goSearch = () => {
    let c = query[0];
    if (c === "#" || c === "@" || c === "&") {
      navigate("/intercept", { query });
      intercept();
    } else {
      navigate("/search", { query });
    }
  };

  const openSidebar = async ev => {
    let loc = window.location.href;
    browser.sidebarAction.setPanel({ panel: loc });
    browser.sidebarAction.open();
  };

  const closeSidebar = async ev => {
    let loc = await browser.sidebarAction.getPanel({});
    await browser.tabs.create({ url: loc });
    await browser.sidebarAction.close();
  };

  const openMyProfile = ev => {
    ev.stopPropagation();
    ev.preventDefault();

    if (ssb.feed) {
      navigate("/profile", { feed: ssb.feed });
    }
  };

	function input_input_handler() {
		query = this.value;
		$$invalidate('query', query);
	}

	$$self.$$.update = ($$dirty = { $connected: 1 }) => {
		if ($$dirty.$connected) { if ($connected) {
        ssb.avatar(ssb.feed).then(data => {
          $$invalidate('avatar', avatar = `http://localhost:8989/blobs/get/${data.image}`);
        });
      } }
	};

	return {
		connected,
		avatar,
		query,
		goSettings,
		goCompose,
		goComposeBlog,
		goPublic,
		goChannels,
		goMentions,
		goSearch,
		openSidebar,
		closeSidebar,
		openMyProfile,
		$connected,
		input_input_handler
	};
}

class Navigation extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-1avaaxb-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Navigation;

},{"./utils.js":30,"svelte/internal":8}],13:[function(require,module,exports){
/* Patchfox.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	check_outros,
	component_subscribe,
	destroy_component,
	detach,
	element,
	globals,
	group_outros,
	init,
	insert,
	listen,
	mount_component,
	run_all,
	safe_not_equal,
	space,
	toggle_class,
	transition_in,
	transition_out,
	validate_store
} = require("svelte/internal");

const { window: window_1 } = globals;

const file = "Patchfox.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-64hhw0-style';
	style.textContent = ".reduced-line-length.svelte-64hhw0{max-width:840px;margin:auto}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGF0Y2hmb3guc3ZlbHRlIiwic291cmNlcyI6WyJQYXRjaGZveC5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cclxuICBjb25zdCB7IG9uTW91bnQsIG9uRGVzdHJveSB9ID0gcmVxdWlyZShcInN2ZWx0ZVwiKTtcclxuICBjb25zdCB7XHJcbiAgICBjb25uZWN0ZWQsXHJcbiAgICByb3V0ZSxcclxuICAgIG5hdmlnYXRlLFxyXG4gICAgY3VycmVudFZpZXcsXHJcbiAgICBjb25uZWN0LFxyXG4gICAgcmVjb25uZWN0LFxyXG4gICAgcm91dGVMb2NhdGlvbixcclxuICAgIGtlZXBQaW5naW5nLFxyXG4gICAgbG9hZENhY2hlcyxcclxuICB9ID0gcmVxdWlyZShcIi4vdXRpbHMuanNcIik7XHJcbiAgY29uc3QgeyBnZXRQcmVmIH0gPSByZXF1aXJlKFwiLi9wcmVmcy5qc1wiKTtcclxuICBjb25zdCBOYXZpZ2F0aW9uID0gcmVxdWlyZShcIi4vTmF2aWdhdGlvbi5zdmVsdGVcIik7XHJcblxyXG4gIGxldCB1c2VTaG9ydENvbHVtbiA9IGdldFByZWYoXCJjb2x1bW5TaXplXCIsIFwic2hvcnRcIikgPT0gXCJzaG9ydFwiO1xyXG4gIGNvbnNvbGUubG9nKFwiY29sdW1uU2l6ZVwiLCB1c2VTaG9ydENvbHVtbik7XHJcblxyXG4gIG9uTW91bnQoYXN5bmMgKCkgPT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgY29ubmVjdCgpO1xyXG4gICAgICBhd2FpdCBsb2FkQ2FjaGVzKCk7XHJcblxyXG4gICAgICBrZWVwUGluZ2luZygpO1xyXG4gICAgfSBjYXRjaCAobikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiY29ubmVjdCBlcnJvclwiLCBuKTtcclxuICAgICAgc3dpdGNoIChuKSB7XHJcbiAgICAgICAgY2FzZSBcIkNhbid0IGNvbm5lY3QgdG8gc2JvdFwiOlxyXG4gICAgICAgICAgLy8gbmVlZCB0byBiZSBhYmxlIHRvIGdvIHRvIHNldHRpbmdzIGV2ZW4gdGhvdWdoIG5vIGNvbm5lY3Rpb24gaXNcclxuICAgICAgICAgIC8vIGVzdGFibGlzaGVkLlxyXG4gICAgICAgICAgaWYgKCRyb3V0ZUxvY2F0aW9uICE9PSBcIi9zZXR0aW5nc1wiKSB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbiA9IFwiL2RvY3MvaW5kZXguaHRtbCMvdHJvdWJsZXNob290aW5nL25vLWNvbm5lY3Rpb25cIjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBuYXZpZ2F0ZShcIi9lcnJvclwiLCB7IGVycm9yOiBuIH0pO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgY29uc3QgcG9wU3RhdGUgPSBldmVudCA9PiB7XHJcbiAgICBpZiAoZXZlbnQuc3RhdGUgIT09IG51bGwpIHtcclxuICAgICAgY29uc29sZS5kaXIoXCJwb3BcIiwgZXZlbnQuc3RhdGUpO1xyXG4gICAgICBsZXQgeyBsb2NhdGlvbiwgZGF0YSB9ID0gZXZlbnQuc3RhdGU7XHJcbiAgICAgIHJvdXRlLnNldCh7IGxvY2F0aW9uLCBkYXRhIH0pO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIGNvbnN0IGhhbmRsZVVuY2F1Z2h0RXhjZXB0aW9uID0gZXZlbnQgPT4ge1xyXG4gICAgY29uc29sZS5lcnJvcihcIlVuY2F1Z2h0IGV4Y2VwdGlvblwiLCBldmVudCk7XHJcbiAgICBuYXZpZ2F0ZShcIi9lcnJvclwiLCB7IGVycm9yOiBldmVudC5tZXNzYWdlIH0pO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGhhc2hDaGFuZ2UgPSBldmVudCA9PiB7XHJcbiAgICBjb25zb2xlLmRpcihcImhhc2ggY2hhbmdlXCIsIGV2ZW50KTtcclxuICB9O1xyXG48L3NjcmlwdD5cclxuXHJcbjxzdHlsZT5cclxuICAucmVkdWNlZC1saW5lLWxlbmd0aCB7XHJcbiAgICBtYXgtd2lkdGg6IDg0MHB4O1xyXG4gICAgbWFyZ2luOiBhdXRvO1xyXG4gIH1cclxuPC9zdHlsZT5cclxuXHJcbjxzdmVsdGU6d2luZG93XHJcbiAgb246cG9wc3RhdGU9e3BvcFN0YXRlfVxyXG4gIG9uOmVycm9yPXtoYW5kbGVVbmNhdWdodEV4Y2VwdGlvbn1cclxuICBvbjpoYXNoY2hhbmdlPXtoYXNoQ2hhbmdlfSAvPlxyXG5cclxuPGRpdiBjbGFzcz1cImNvbnRhaW5lciBiZy1ncmF5XCI+XHJcbiAgPE5hdmlnYXRpb24gLz5cclxuICA8ZGl2IGNsYXNzPVwiY29sdW1uc1wiPlxyXG4gICAgPGRpdiBjbGFzcz1cImNvbHVtblwiIGNsYXNzOnJlZHVjZWQtbGluZS1sZW5ndGg9e3VzZVNob3J0Q29sdW1ufT5cclxuICAgICAgPHN2ZWx0ZTpjb21wb25lbnQgdGhpcz17JGN1cnJlbnRWaWV3fSAvPlxyXG4gICAgPC9kaXY+XHJcbiAgPC9kaXY+XHJcbjwvZGl2PlxyXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBNkRFLG9CQUFvQixjQUFDLENBQUMsQUFDcEIsU0FBUyxDQUFFLEtBQUssQ0FDaEIsTUFBTSxDQUFFLElBQUksQUFDZCxDQUFDIn0= */";
	append(document.head, style);
}

function create_fragment(ctx) {
	var div2, t, div1, div0, current, dispose;

	var navigation = new ctx.Navigation({ $$inline: true });

	var switch_value = ctx.$currentView;

	function switch_props(ctx) {
		return { $$inline: true };
	}

	if (switch_value) {
		var switch_instance = new switch_value(switch_props(ctx));
	}

	return {
		c: function create() {
			div2 = element("div");
			navigation.$$.fragment.c();
			t = space();
			div1 = element("div");
			div0 = element("div");
			if (switch_instance) switch_instance.$$.fragment.c();
			attr(div0, "class", "column svelte-64hhw0");
			toggle_class(div0, "reduced-line-length", ctx.useShortColumn);
			add_location(div0, file, 75, 4, 1807);
			attr(div1, "class", "columns");
			add_location(div1, file, 74, 2, 1780);
			attr(div2, "class", "container bg-gray");
			add_location(div2, file, 72, 0, 1727);

			dispose = [
				listen(window_1, "popstate", ctx.popState),
				listen(window_1, "error", ctx.handleUncaughtException),
				listen(window_1, "hashchange", ctx.hashChange)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div2, anchor);
			mount_component(navigation, div2, null);
			append(div2, t);
			append(div2, div1);
			append(div1, div0);

			if (switch_instance) {
				mount_component(switch_instance, div0, null);
			}

			current = true;
		},

		p: function update(changed, ctx) {
			if (switch_value !== (switch_value = ctx.$currentView)) {
				if (switch_instance) {
					group_outros();
					const old_component = switch_instance;
					transition_out(old_component.$$.fragment, 1, 0, () => {
						destroy_component(old_component, 1);
					});
					check_outros();
				}

				if (switch_value) {
					switch_instance = new switch_value(switch_props(ctx));

					switch_instance.$$.fragment.c();
					transition_in(switch_instance.$$.fragment, 1);
					mount_component(switch_instance, div0, null);
				} else {
					switch_instance = null;
				}
			}

			if (changed.useShortColumn) {
				toggle_class(div0, "reduced-line-length", ctx.useShortColumn);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(navigation.$$.fragment, local);

			if (switch_instance) transition_in(switch_instance.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(navigation.$$.fragment, local);
			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div2);
			}

			destroy_component(navigation);

			if (switch_instance) destroy_component(switch_instance);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $routeLocation, $currentView;

	const { onMount, onDestroy } = require("svelte");
  const {
    connected,
    route,
    navigate,
    currentView,
    connect,
    reconnect,
    routeLocation,
    keepPinging,
    loadCaches,
  } = require("./utils.js"); validate_store(currentView, 'currentView'); component_subscribe($$self, currentView, $$value => { $currentView = $$value; $$invalidate('$currentView', $currentView) }); validate_store(routeLocation, 'routeLocation'); component_subscribe($$self, routeLocation, $$value => { $routeLocation = $$value; $$invalidate('$routeLocation', $routeLocation) });
  const { getPref } = require("./prefs.js");
  const Navigation = require("./Navigation.svelte");

  let useShortColumn = getPref("columnSize", "short") == "short";
  console.log("columnSize", useShortColumn);

  onMount(async () => {
    try {
      await connect();
      await loadCaches();

      keepPinging();
    } catch (n) {
      console.error("connect error", n);
      switch (n) {
        case "Can't connect to sbot":
          // need to be able to go to settings even though no connection is
          // established.
          if ($routeLocation !== "/settings") {
            window.location = "/docs/index.html#/troubleshooting/no-connection";
          }
          break;
        default:
          navigate("/error", { error: n });
          break;
      }
    }
  });

  const popState = event => {
    if (event.state !== null) {
      console.dir("pop", event.state);
      let { location, data } = event.state;
      route.set({ location, data });
    }
  };

  const handleUncaughtException = event => {
    console.error("Uncaught exception", event);
    navigate("/error", { error: event.message });
  };

  const hashChange = event => {
    console.dir("hash change", event);
  };

	return {
		currentView,
		routeLocation,
		Navigation,
		useShortColumn,
		popState,
		handleUncaughtException,
		hashChange,
		$currentView
	};
}

class Patchfox extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-64hhw0-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Patchfox;

},{"./Navigation.svelte":12,"./prefs.js":28,"./utils.js":30,"svelte":7,"svelte/internal":8}],14:[function(require,module,exports){
const { getPref, setPref } = require("./prefs.js")

const getFilters = () => getPref("filters", [])

const addFilter = (filter) => {
    let currentFilters = getFilters()

    currentFilters.push(filter)

    setPref("filters", currentFilters)
}

const deleteFilter = (filter) => {
    let currentFilters = getFilters()

    setPref("filters", currentFilters.filter(f => f !== filter))
}

const isMessageBlured = (msg) => {
    let currentFilters = getFilters().filter(f => f.action == "blur")
    if (currentFilters.length > 0) {
        let res = currentFilters.map((f) => isMessageFiltered(msg, f, "blur"))
        return !res.some(r => r)
    } else {
        return false
    }
}


const isMessageHidden = (msg) => {
    let currentFilters = getFilters().filter(f => f.action == "hide")
    if (currentFilters.length > 0) {
        let res = currentFilters.map((f) => isMessageFiltered(msg, f, "hide"))
        return res.some(r => r)
    } else {
        return true // true because it is used by a pull.filter()
    }
}

const isMessageFiltered = (msg, filter, action) => {
    let filterResults = []
    if (filter.action !== action) {
        return true
    }

    if (filter.expires) {
        let expirationDate = new Date(filter.expires)
        let today = new Date()

        if (today > expirationDate) {
            return true
        }
    }

    if (filter.feed) {
        if (filter.feed == msg.value.author) {
            console.log("filtered due to feed")
            filterResults.push(true)
        } else {
            filterResults.push(false)
        }
    }

    if (filter.channel) {
        console.log("filtered due to channel")
        if (msg.value.content.channel && filter.channel == msg.value.content.channel) {
            filterResults.push(true)
        } else {
            filterResults.push(false)
        }
    }

    if (filter.keywords.length > 0 && msg.value.content.type == "post" && msg.value.content.text) {
        let keywords = filter.keywords
        let content = msg.value.content.text.toLowerCase()

        let res = keywords.map(k => content.includes(k.toLowerCase())).some(r => r)
        if (res) console.log("filtered due to keywords")
        filterResults.push(res)
    }

    console.log("res", !filterResults.some(n => n == true))
    return !filterResults.some(n => n == true)
}

module.exports = {
    getFilters,
    isMessageBlured,
    isMessageFiltered,
    isMessageHidden,
    addFilter,
    deleteFilter
}
},{"./prefs.js":28}],15:[function(require,module,exports){
const Patchfox = require("./Patchfox.svelte");

const {
    navigate,
    intercept,
} =  require("./utils.js");

const { loadConfiguration } = require("./prefs.js")

const main = async () => {
    window.ssb = false;

    intercept()

    try {
        await loadConfiguration()

    } catch (n) {
        console.error("initialization error", n)
        switch (n) {
            case "Configuration is missing":
                navigate("/settings")
                break
            default:
                navigate("/error", { error: n })
                break
        }

    }

    const patchfox = new Patchfox({
        target: document.body
    });
}

main()
},{"./Patchfox.svelte":13,"./prefs.js":28,"./utils.js":30}],16:[function(require,module,exports){
/* AboutMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	empty,
	init,
	insert,
	noop,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");

const file = "AboutMsg.svelte";

// (52:2) {:else}
function create_else_block_1(ctx) {
	var div, t0, t1;

	return {
		c: function create() {
			div = element("div");
			t0 = text(ctx.person);
			t1 = text(" is doing something related to a gathering but gatherings are not\r\n      supported yet, sorry.");
			attr(div, "class", "toast");
			add_location(div, file, 52, 4, 1454);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
		},

		p: function update(changed, ctx) {
			if (changed.person) {
				set_data(t0, ctx.person);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (35:2) {#if isThisAboutFeeds}
function create_if_block(ctx) {
	var t0, t1, t2, t3, a, a_href_value, t4, if_block1_anchor;

	function select_block_type_1(ctx) {
		if (ctx.image) return create_if_block_2;
		return create_else_block;
	}

	var current_block_type = select_block_type_1(ctx);
	var if_block0 = current_block_type(ctx);

	var if_block1 = (ctx.msg.value.content.description) && create_if_block_1(ctx);

	return {
		c: function create() {
			t0 = text(ctx.person);
			t1 = space();
			t2 = text(ctx.verb);
			t3 = space();
			a = element("a");
			if_block0.c();
			t4 = space();
			if (if_block1) if_block1.c();
			if_block1_anchor = empty();
			attr(a, "href", a_href_value = "?feed=" + ctx.otherLink + "#/profile");
			add_location(a, file, 36, 4, 1002);
		},

		m: function mount(target, anchor) {
			insert(target, t0, anchor);
			insert(target, t1, anchor);
			insert(target, t2, anchor);
			insert(target, t3, anchor);
			insert(target, a, anchor);
			if_block0.m(a, null);
			insert(target, t4, anchor);
			if (if_block1) if_block1.m(target, anchor);
			insert(target, if_block1_anchor, anchor);
		},

		p: function update(changed, ctx) {
			if (changed.person) {
				set_data(t0, ctx.person);
			}

			if (changed.verb) {
				set_data(t2, ctx.verb);
			}

			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block0) {
				if_block0.p(changed, ctx);
			} else {
				if_block0.d(1);
				if_block0 = current_block_type(ctx);
				if (if_block0) {
					if_block0.c();
					if_block0.m(a, null);
				}
			}

			if (ctx.msg.value.content.description) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_1(ctx);
					if_block1.c();
					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(t0);
				detach(t1);
				detach(t2);
				detach(t3);
				detach(a);
			}

			if_block0.d();

			if (detaching) {
				detach(t4);
			}

			if (if_block1) if_block1.d(detaching);

			if (detaching) {
				detach(if_block1_anchor);
			}
		}
	};
}

// (43:6) {:else}
function create_else_block(ctx) {
	var span, t;

	return {
		c: function create() {
			span = element("span");
			t = text(ctx.otherName);
			attr(span, "class", "chip");
			add_location(span, file, 43, 8, 1223);
		},

		m: function mount(target, anchor) {
			insert(target, span, anchor);
			append(span, t);
		},

		p: function update(changed, ctx) {
			if (changed.otherName) {
				set_data(t, ctx.otherName);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(span);
			}
		}
	};
}

// (38:6) {#if image}
function create_if_block_2(ctx) {
	var div, img, t0, t1;

	return {
		c: function create() {
			div = element("div");
			img = element("img");
			t0 = space();
			t1 = text(ctx.otherName);
			attr(img, "src", ctx.image);
			attr(img, "class", "avatar avatar-sm");
			attr(img, "alt", ctx.otherName);
			add_location(img, file, 39, 10, 1098);
			attr(div, "class", "chip");
			add_location(div, file, 38, 8, 1068);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, img);
			append(div, t0);
			append(div, t1);
		},

		p: function update(changed, ctx) {
			if (changed.otherName) {
				attr(img, "alt", ctx.otherName);
				set_data(t1, ctx.otherName);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (47:4) {#if msg.value.content.description}
function create_if_block_1(ctx) {
	var blockquote, raw_value = ctx.ssb.markdown(ctx.msg.value.content.description);

	return {
		c: function create() {
			blockquote = element("blockquote");
			add_location(blockquote, file, 47, 6, 1332);
		},

		m: function mount(target, anchor) {
			insert(target, blockquote, anchor);
			blockquote.innerHTML = raw_value;
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && raw_value !== (raw_value = ctx.ssb.markdown(ctx.msg.value.content.description))) {
				blockquote.innerHTML = raw_value;
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(blockquote);
			}
		}
	};
}

function create_fragment(ctx) {
	var div;

	function select_block_type(ctx) {
		if (ctx.isThisAboutFeeds) return create_if_block;
		return create_else_block_1;
	}

	var current_block_type = select_block_type(ctx);
	var if_block = current_block_type(ctx);

	return {
		c: function create() {
			div = element("div");
			if_block.c();
			attr(div, "class", "card-body");
			add_location(div, file, 33, 0, 926);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			if_block.m(div, null);
		},

		p: function update(changed, ctx) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(changed, ctx);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);
				if (if_block) {
					if_block.c();
					if_block.m(div, null);
				}
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			if_block.d();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { msg } = $$props;

  let person = msg.value.author;
  let otherLink = encodeURIComponent(msg.value.content.about);
  let otherName = msg.value.content.name || msg.value.content.about;
  let isThisAboutFeeds = true;
  let verb =
    msg.value.content.about === msg.value.author
      ? "self-identifies"
      : "identifies";

  ssb.avatar(msg.value.author).then(data => { const $$result = (person = data.name); $$invalidate('person', person); return $$result; });

  if (otherName === msg.value.content.about) {
    ssb.avatar(msg.value.content.about).then(data => { const $$result = (otherName = data.name); $$invalidate('otherName', otherName); return $$result; });
  }

  let image = msg.value.content.image
    ? `http://localhost:8989/blobs/get/${encodeURIComponent(
        msg.value.content.image
      )}`
    : false;

  if (msg.value.content.description) {
    $$invalidate('verb', verb += " with description");
  }

  if (msg.value.content.about.startsWith("%")) {
    $$invalidate('isThisAboutFeeds', isThisAboutFeeds = false); // this appear to be a gathering
  }

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<AboutMsg> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return {
		msg,
		person,
		otherLink,
		otherName,
		isThisAboutFeeds,
		verb,
		image,
		ssb
	};
}

class AboutMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console.warn("<AboutMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<AboutMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<AboutMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = AboutMsg;

},{"svelte/internal":8}],17:[function(require,module,exports){
/* BlogMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	HtmlTag,
	SvelteComponentDev,
	add_location,
	append,
	attr,
	component_subscribe,
	detach,
	element,
	globals,
	init,
	insert,
	listen,
	noop,
	prevent_default,
	run_all,
	safe_not_equal,
	set_data,
	space,
	text,
	toggle_class,
	validate_store
} = require("svelte/internal");

const { console: console_1 } = globals;

const file = "BlogMsg.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-ygl8m2-style';
	style.textContent = "\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmxvZ01zZy5zdmVsdGUiLCJzb3VyY2VzIjpbIkJsb2dNc2cuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XHJcbiAgY29uc3QgeyBuYXZpZ2F0ZSwgcm91dGVMb2NhdGlvbiB9ID0gcmVxdWlyZShcIi4uL3V0aWxzLmpzXCIpO1xyXG5cclxuICBleHBvcnQgbGV0IG1zZztcclxuXHJcbiAgbGV0IGNvbnRlbnQgPSBtc2cudmFsdWUuY29udGVudDtcclxuXHJcbiAgbGV0IHN1bW1hcnkgPSBzc2IubWFya2Rvd24oY29udGVudC5zdW1tYXJ5KTtcclxuICBsZXQgdGh1bWJuYWlsID0gY29udGVudC50aHVtYm5haWwgfHwgZmFsc2U7XHJcbiAgbGV0IHRpdGxlID0gY29udGVudC50aXRsZSB8fCBmYWxzZTtcclxuICBsZXQgc2hvd0Jsb2dwb3N0ID0gZmFsc2U7XHJcbiAgbGV0IGxvYWRpbmcgPSBmYWxzZTtcclxuICBsZXQgdG9hc3QgPSBmYWxzZTtcclxuICBsZXQgdG9hc3RNc2cgPSBcIlwiO1xyXG4gIGxldCBwb3N0ID0gc3VtbWFyeTtcclxuXHJcbiAgbGV0IGxpa2VkID0gZmFsc2U7XHJcblxyXG4gIHNzYi52b3Rlcyhtc2cua2V5KS50aGVuKG1zID0+IHtcclxuICAgIG1zLmZvckVhY2gobSA9PiB7XHJcbiAgICAgIGxldCBhdXRob3IgPSBtLnZhbHVlLmF1dGhvcjtcclxuICAgICAgaWYgKChhdXRob3IgPT09IHNzYi5mZWVkICYmIG0udmFsdWUuY29udGVudC52b3RlLnZhbHVlID09PSAxKSkge1xyXG4gICAgICAgIGxpa2VkID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IGxpa2VDaGFuZ2VkID0gZXYgPT4ge1xyXG4gICAgbGV0IHYgPSBldi50YXJnZXQuY2hlY2tlZDtcclxuICAgIGlmICh2KSB7XHJcbiAgICAgIHNzYlxyXG4gICAgICAgIC5saWtlKG1zZy5rZXkpXHJcbiAgICAgICAgLnRoZW4oKCkgPT4gY29uc29sZS5sb2coXCJsaWtlZFwiLCBtc2cua2V5KSlcclxuICAgICAgICAuY2F0Y2goKCkgPT4gKGxpa2VkID0gZmFsc2UpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHNzYlxyXG4gICAgICAgIC51bmxpa2UobXNnLmtleSlcclxuICAgICAgICAudGhlbigoKSA9PiBjb25zb2xlLmxvZyhcInVubGlrZWRcIiwgbXNnLmtleSkpXHJcbiAgICAgICAgLmNhdGNoKCgpID0+IChsaWtlZCA9IHRydWUpKTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBkaXNwbGF5QmxvZ1Bvc3QgPSBldiA9PiB7XHJcbiAgICBsb2FkaW5nID0gdHJ1ZTtcclxuICAgIGNvbnNvbGUubG9nKFwibG9hZGluZyBibG9ncG9zdFwiLCBjb250ZW50LmJsb2cpO1xyXG5cclxuICAgIHNzYlxyXG4gICAgICAuZ2V0QmxvYihjb250ZW50LmJsb2cpXHJcbiAgICAgIC50aGVuKGRhdGEgPT4ge1xyXG4gICAgICAgIHBvc3QgPSBzc2IubWFya2Rvd24oZGF0YSk7XHJcbiAgICAgICAgc2hvd0Jsb2dwb3N0ID0gdHJ1ZTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGVyciA9PiB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IGxvYWQgYmxvZyBwb3N0XCIsIGVycik7XHJcbiAgICAgICAgdG9hc3QgPSB0cnVlO1xyXG4gICAgICAgIHRvYXN0TXNnID0gZXJyO1xyXG4gICAgICB9KTtcclxuICB9O1xyXG5cclxuICBjb25zdCByZXBseSA9IGV2ID0+IHtcclxuICAgIGxldCByb290SWQgPSBtc2cudmFsdWUuY29udGVudC5yb290IHx8IG1zZy5rZXk7XHJcbiAgICBsZXQgY2hhbm5lbCA9IG1zZy52YWx1ZS5jb250ZW50LmNoYW5uZWw7XHJcbiAgICBuYXZpZ2F0ZShcIi9jb21wb3NlXCIsIHsgcm9vdDogcm9vdElkLCBicmFuY2g6IG1zZy5rZXksIGNoYW5uZWwgfSk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgZ29Sb290ID0gZXYgPT4ge1xyXG4gICAgbGV0IHJvb3RJZCA9IG1zZy52YWx1ZS5jb250ZW50LnJvb3QgfHwgbXNnLmtleTtcclxuICAgIG5hdmlnYXRlKFwiL3RocmVhZFwiLCB7IHRocmVhZDogcm9vdElkIH0pO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGdvQnJhbmNoID0gZXYgPT4ge1xyXG4gICAgbGV0IGJyYW5jaElkID0gbXNnLnZhbHVlLmNvbnRlbnQuYnJhbmNoIHx8IG1zZy5rZXk7XHJcbiAgICBuYXZpZ2F0ZShcIi90aHJlYWRcIiwgeyB0aHJlYWQ6IGJyYW5jaElkIH0pO1xyXG4gIH07XHJcblxyXG4gIGlmICgkcm91dGVMb2NhdGlvbiA9PSBcIi90aHJlYWRcIikge1xyXG4gICAgc2V0VGltZW91dChkaXNwbGF5QmxvZ1Bvc3QsIDEwMCk7XHJcbiAgfVxyXG48L3NjcmlwdD5cclxuXHJcbjxzdHlsZT5cclxuICBkaXYgaW1nLmlzLWltYWdlLWZyb20tYmxvYiB7XHJcbiAgICBtYXgtd2lkdGg6IDkwJTtcclxuICB9XHJcbjwvc3R5bGU+XHJcblxyXG57I2lmIHRodW1ibmFpbH1cclxuICA8ZGl2IGNsYXNzPVwiY2FyZC1pbWFnZVwiPlxyXG4gICAgPGltZ1xyXG4gICAgICBzcmM9XCJodHRwOi8vbG9jYWxob3N0Ojg5ODkvYmxvYnMvZ2V0L3tlbmNvZGVVUklDb21wb25lbnQodGh1bWJuYWlsKX1cIlxyXG4gICAgICBjbGFzcz1cImltZy1yZXNwb25zaXZlXCJcclxuICAgICAgYWx0PXt0aXRsZX0gLz5cclxuICA8L2Rpdj5cclxuey9pZn1cclxuPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxyXG4gIHsjaWYgdGl0bGV9XHJcbiAgICA8aDEgY2xhc3M9XCJjYXJkLXRpdGxlIGg1XCI+e3RpdGxlfTwvaDE+XHJcbiAgey9pZn1cclxuXHJcbiAgeyNpZiB0b2FzdH1cclxuICAgIDxkaXYgY2xhc3M9XCJ0b2FzdCB0b2FzdC1lcnJvclwiPkNhbid0IGxvYWQgYmxvZ3Bvc3Q6IHt0b2FzdE1zZ308L2Rpdj5cclxuICB7L2lmfVxyXG4gIHsjaWYgc2hvd0Jsb2dwb3N0fVxyXG4gICAge0BodG1sIHBvc3R9XHJcbiAgezplbHNlfVxyXG4gICAge0BodG1sIHN1bW1hcnl9XHJcbiAgey9pZn1cclxuPC9kaXY+XHJcbjxkaXYgY2xhc3M9XCJjYXJkLWZvb3RlclwiPlxyXG4gIDxkaXYgY2xhc3M9XCJjb2x1bW5zIGNvbC1nYXBsZXNzXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29sdW1uIGNvbC02XCI+XHJcbiAgICAgIDxsYWJlbCBjbGFzcz1cImZvcm0tc3dpdGNoIGQtaW5saW5lXCI+XHJcbiAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIG9uOmNoYW5nZT17bGlrZUNoYW5nZWR9IGNoZWNrZWQ9e2xpa2VkfSAvPlxyXG4gICAgICAgIDxpIGNsYXNzPVwiZm9ybS1pY29uXCIgLz5cclxuICAgICAgICBMaWtlXHJcbiAgICAgIDwvbGFiZWw+XHJcbiAgICAgIHsjaWYgbXNnLnZhbHVlLmNvbnRlbnQucm9vdH1cclxuICAgICAgICA8c3Bhbj5cclxuICAgICAgICAgIDxhXHJcbiAgICAgICAgICAgIGhyZWY9XCI/dGhyZWFkPXtlbmNvZGVVUklDb21wb25lbnQobXNnLnZhbHVlLmNvbnRlbnQucm9vdCl9Iy90aHJlYWRcIlxyXG4gICAgICAgICAgICBvbjpjbGlja3xwcmV2ZW50RGVmYXVsdD17Z29Sb290fT5cclxuICAgICAgICAgICAgKHJvb3QpXHJcbiAgICAgICAgICA8L2E+XHJcbiAgICAgICAgPC9zcGFuPlxyXG4gICAgICB7L2lmfVxyXG4gICAgICB7I2lmIG1zZy52YWx1ZS5jb250ZW50LmJyYW5jaH1cclxuICAgICAgICA8c3Bhbj5cclxuICAgICAgICAgIDxhXHJcbiAgICAgICAgICAgIGhyZWY9XCI/dGhyZWFkPXtlbmNvZGVVUklDb21wb25lbnQobXNnLnZhbHVlLmNvbnRlbnQuYnJhbmNoKX0jL3RocmVhZFwiXHJcbiAgICAgICAgICAgIG9uOmNsaWNrfHByZXZlbnREZWZhdWx0PXtnb0JyYW5jaH0+XHJcbiAgICAgICAgICAgIChpbiByZXBseSB0bylcclxuICAgICAgICAgIDwvYT5cclxuICAgICAgICA8L3NwYW4+XHJcbiAgICAgIHsvaWZ9XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2x1bW4gY29sLTYgdGV4dC1yaWdodFwiPlxyXG4gICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuXCIgb246Y2xpY2s9e3JlcGx5fT5SZXBseTwvYnV0dG9uPlxyXG4gICAgICB7I2lmICFzaG93QmxvZ3Bvc3R9XHJcbiAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIlxyXG4gICAgICAgICAgY2xhc3M6bG9jYXRpbmc9e2xvYWRpbmd9XHJcbiAgICAgICAgICBvbjpjbGljaz17ZGlzcGxheUJsb2dQb3N0fT5cclxuICAgICAgICAgIFJlYWQgQmxvZ3Bvc3RcclxuICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgezplbHNlfVxyXG4gICAgICAgIDxidXR0b25cclxuICAgICAgICAgIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCJcclxuICAgICAgICAgIGNsYXNzOmxvY2F0aW5nPXtsb2FkaW5nfVxyXG4gICAgICAgICAgb246Y2xpY2s9eygpID0+IChzaG93QmxvZ3Bvc3QgPSBmYWxzZSl9PlxyXG4gICAgICAgICAgQ2xvc2UgQmxvZ3Bvc3RcclxuICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgey9pZn1cclxuICAgIDwvZGl2PlxyXG4gIDwvZGl2PlxyXG5cclxuPC9kaXY+XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiIn0= */";
	append(document.head, style);
}

// (87:0) {#if thumbnail}
function create_if_block_6(ctx) {
	var div, img, img_src_value;

	return {
		c: function create() {
			div = element("div");
			img = element("img");
			attr(img, "src", img_src_value = "http://localhost:8989/blobs/get/" + encodeURIComponent(ctx.thumbnail));
			attr(img, "class", "img-responsive");
			attr(img, "alt", ctx.title);
			add_location(img, file, 88, 4, 2084);
			attr(div, "class", "card-image");
			add_location(div, file, 87, 2, 2054);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, img);
		},

		p: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (96:2) {#if title}
function create_if_block_5(ctx) {
	var h1, t;

	return {
		c: function create() {
			h1 = element("h1");
			t = text(ctx.title);
			attr(h1, "class", "card-title h5");
			add_location(h1, file, 96, 4, 2280);
		},

		m: function mount(target, anchor) {
			insert(target, h1, anchor);
			append(h1, t);
		},

		p: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h1);
			}
		}
	};
}

// (100:2) {#if toast}
function create_if_block_4(ctx) {
	var div, t0, t1;

	return {
		c: function create() {
			div = element("div");
			t0 = text("Can't load blogpost: ");
			t1 = text(ctx.toastMsg);
			attr(div, "class", "toast toast-error");
			add_location(div, file, 100, 4, 2350);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
		},

		p: function update(changed, ctx) {
			if (changed.toastMsg) {
				set_data(t1, ctx.toastMsg);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (105:2) {:else}
function create_else_block_1(ctx) {
	var html_tag;

	return {
		c: function create() {
			html_tag = new HtmlTag(ctx.summary, null);
		},

		m: function mount(target, anchor) {
			html_tag.m(target, anchor);
		},

		p: noop,

		d: function destroy(detaching) {
			if (detaching) {
				html_tag.d();
			}
		}
	};
}

// (103:2) {#if showBlogpost}
function create_if_block_3(ctx) {
	var html_tag;

	return {
		c: function create() {
			html_tag = new HtmlTag(ctx.post, null);
		},

		m: function mount(target, anchor) {
			html_tag.m(target, anchor);
		},

		p: function update(changed, ctx) {
			if (changed.post) {
				html_tag.p(ctx.post);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				html_tag.d();
			}
		}
	};
}

// (117:6) {#if msg.value.content.root}
function create_if_block_2(ctx) {
	var span, a, t, a_href_value, dispose;

	return {
		c: function create() {
			span = element("span");
			a = element("a");
			t = text("(root)");
			attr(a, "href", a_href_value = "?thread=" + encodeURIComponent(ctx.msg.value.content.root) + "#/thread");
			add_location(a, file, 118, 10, 2858);
			add_location(span, file, 117, 8, 2840);
			dispose = listen(a, "click", prevent_default(ctx.goRoot));
		},

		m: function mount(target, anchor) {
			insert(target, span, anchor);
			append(span, a);
			append(a, t);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && a_href_value !== (a_href_value = "?thread=" + encodeURIComponent(ctx.msg.value.content.root) + "#/thread")) {
				attr(a, "href", a_href_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(span);
			}

			dispose();
		}
	};
}

// (126:6) {#if msg.value.content.branch}
function create_if_block_1(ctx) {
	var span, a, t, a_href_value, dispose;

	return {
		c: function create() {
			span = element("span");
			a = element("a");
			t = text("(in reply to)");
			attr(a, "href", a_href_value = "?thread=" + encodeURIComponent(ctx.msg.value.content.branch) + "#/thread");
			add_location(a, file, 127, 10, 3120);
			add_location(span, file, 126, 8, 3102);
			dispose = listen(a, "click", prevent_default(ctx.goBranch));
		},

		m: function mount(target, anchor) {
			insert(target, span, anchor);
			append(span, a);
			append(a, t);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && a_href_value !== (a_href_value = "?thread=" + encodeURIComponent(ctx.msg.value.content.branch) + "#/thread")) {
				attr(a, "href", a_href_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(span);
			}

			dispose();
		}
	};
}

// (145:6) {:else}
function create_else_block(ctx) {
	var button, dispose;

	return {
		c: function create() {
			button = element("button");
			button.textContent = "Close Blogpost";
			attr(button, "class", "btn btn-primary");
			toggle_class(button, "locating", ctx.loading);
			add_location(button, file, 145, 8, 3664);
			dispose = listen(button, "click", ctx.click_handler);
		},

		m: function mount(target, anchor) {
			insert(target, button, anchor);
		},

		p: function update(changed, ctx) {
			if (changed.loading) {
				toggle_class(button, "locating", ctx.loading);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(button);
			}

			dispose();
		}
	};
}

// (138:6) {#if !showBlogpost}
function create_if_block(ctx) {
	var button, dispose;

	return {
		c: function create() {
			button = element("button");
			button.textContent = "Read Blogpost";
			attr(button, "class", "btn btn-primary");
			toggle_class(button, "locating", ctx.loading);
			add_location(button, file, 138, 8, 3478);
			dispose = listen(button, "click", ctx.displayBlogPost);
		},

		m: function mount(target, anchor) {
			insert(target, button, anchor);
		},

		p: function update(changed, ctx) {
			if (changed.loading) {
				toggle_class(button, "locating", ctx.loading);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(button);
			}

			dispose();
		}
	};
}

function create_fragment(ctx) {
	var t0, div0, t1, t2, t3, div4, div3, div1, label, input, t4, i, t5, t6, t7, t8, div2, button, t10, dispose;

	var if_block0 = (ctx.thumbnail) && create_if_block_6(ctx);

	var if_block1 = (ctx.title) && create_if_block_5(ctx);

	var if_block2 = (ctx.toast) && create_if_block_4(ctx);

	function select_block_type(ctx) {
		if (ctx.showBlogpost) return create_if_block_3;
		return create_else_block_1;
	}

	var current_block_type = select_block_type(ctx);
	var if_block3 = current_block_type(ctx);

	var if_block4 = (ctx.msg.value.content.root) && create_if_block_2(ctx);

	var if_block5 = (ctx.msg.value.content.branch) && create_if_block_1(ctx);

	function select_block_type_1(ctx) {
		if (!ctx.showBlogpost) return create_if_block;
		return create_else_block;
	}

	var current_block_type_1 = select_block_type_1(ctx);
	var if_block6 = current_block_type_1(ctx);

	return {
		c: function create() {
			if (if_block0) if_block0.c();
			t0 = space();
			div0 = element("div");
			if (if_block1) if_block1.c();
			t1 = space();
			if (if_block2) if_block2.c();
			t2 = space();
			if_block3.c();
			t3 = space();
			div4 = element("div");
			div3 = element("div");
			div1 = element("div");
			label = element("label");
			input = element("input");
			t4 = space();
			i = element("i");
			t5 = text("\r\n        Like");
			t6 = space();
			if (if_block4) if_block4.c();
			t7 = space();
			if (if_block5) if_block5.c();
			t8 = space();
			div2 = element("div");
			button = element("button");
			button.textContent = "Reply";
			t10 = space();
			if_block6.c();
			attr(div0, "class", "card-body");
			add_location(div0, file, 94, 0, 2236);
			attr(input, "type", "checkbox");
			input.checked = ctx.liked;
			add_location(input, file, 112, 8, 2666);
			attr(i, "class", "form-icon");
			add_location(i, file, 113, 8, 2741);
			attr(label, "class", "form-switch d-inline");
			add_location(label, file, 111, 6, 2620);
			attr(div1, "class", "column col-6");
			add_location(div1, file, 110, 4, 2586);
			attr(button, "class", "btn");
			add_location(button, file, 136, 6, 3390);
			attr(div2, "class", "column col-6 text-right");
			add_location(div2, file, 135, 4, 3345);
			attr(div3, "class", "columns col-gapless");
			add_location(div3, file, 109, 2, 2547);
			attr(div4, "class", "card-footer");
			add_location(div4, file, 108, 0, 2518);

			dispose = [
				listen(input, "change", ctx.likeChanged),
				listen(button, "click", ctx.reply)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			if (if_block0) if_block0.m(target, anchor);
			insert(target, t0, anchor);
			insert(target, div0, anchor);
			if (if_block1) if_block1.m(div0, null);
			append(div0, t1);
			if (if_block2) if_block2.m(div0, null);
			append(div0, t2);
			if_block3.m(div0, null);
			insert(target, t3, anchor);
			insert(target, div4, anchor);
			append(div4, div3);
			append(div3, div1);
			append(div1, label);
			append(label, input);
			append(label, t4);
			append(label, i);
			append(label, t5);
			append(div1, t6);
			if (if_block4) if_block4.m(div1, null);
			append(div1, t7);
			if (if_block5) if_block5.m(div1, null);
			append(div3, t8);
			append(div3, div2);
			append(div2, button);
			append(div2, t10);
			if_block6.m(div2, null);
		},

		p: function update(changed, ctx) {
			if (ctx.thumbnail) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_6(ctx);
					if_block0.c();
					if_block0.m(t0.parentNode, t0);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.title) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_5(ctx);
					if_block1.c();
					if_block1.m(div0, t1);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (ctx.toast) {
				if (if_block2) {
					if_block2.p(changed, ctx);
				} else {
					if_block2 = create_if_block_4(ctx);
					if_block2.c();
					if_block2.m(div0, t2);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block3) {
				if_block3.p(changed, ctx);
			} else {
				if_block3.d(1);
				if_block3 = current_block_type(ctx);
				if (if_block3) {
					if_block3.c();
					if_block3.m(div0, null);
				}
			}

			if (changed.liked) {
				input.checked = ctx.liked;
			}

			if (ctx.msg.value.content.root) {
				if (if_block4) {
					if_block4.p(changed, ctx);
				} else {
					if_block4 = create_if_block_2(ctx);
					if_block4.c();
					if_block4.m(div1, t7);
				}
			} else if (if_block4) {
				if_block4.d(1);
				if_block4 = null;
			}

			if (ctx.msg.value.content.branch) {
				if (if_block5) {
					if_block5.p(changed, ctx);
				} else {
					if_block5 = create_if_block_1(ctx);
					if_block5.c();
					if_block5.m(div1, null);
				}
			} else if (if_block5) {
				if_block5.d(1);
				if_block5 = null;
			}

			if (current_block_type_1 === (current_block_type_1 = select_block_type_1(ctx)) && if_block6) {
				if_block6.p(changed, ctx);
			} else {
				if_block6.d(1);
				if_block6 = current_block_type_1(ctx);
				if (if_block6) {
					if_block6.c();
					if_block6.m(div2, null);
				}
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (if_block0) if_block0.d(detaching);

			if (detaching) {
				detach(t0);
				detach(div0);
			}

			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if_block3.d();

			if (detaching) {
				detach(t3);
				detach(div4);
			}

			if (if_block4) if_block4.d();
			if (if_block5) if_block5.d();
			if_block6.d();
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $routeLocation;

	const { navigate, routeLocation } = require("../utils.js"); validate_store(routeLocation, 'routeLocation'); component_subscribe($$self, routeLocation, $$value => { $routeLocation = $$value; $$invalidate('$routeLocation', $routeLocation) });

  let { msg } = $$props;

  let content = msg.value.content;

  let summary = ssb.markdown(content.summary);
  let thumbnail = content.thumbnail || false;
  let title = content.title || false;
  let showBlogpost = false;
  let loading = false;
  let toast = false;
  let toastMsg = "";
  let post = summary;

  let liked = false;

  ssb.votes(msg.key).then(ms => {
    ms.forEach(m => {
      let author = m.value.author;
      if ((author === ssb.feed && m.value.content.vote.value === 1)) {
        $$invalidate('liked', liked = true);
      }
    });
  });

  const likeChanged = ev => {
    let v = ev.target.checked;
    if (v) {
      ssb
        .like(msg.key)
        .then(() => console.log("liked", msg.key))
        .catch(() => { const $$result = (liked = false); $$invalidate('liked', liked); return $$result; });
    } else {
      ssb
        .unlike(msg.key)
        .then(() => console.log("unliked", msg.key))
        .catch(() => { const $$result = (liked = true); $$invalidate('liked', liked); return $$result; });
    }
  };

  const displayBlogPost = ev => {
    $$invalidate('loading', loading = true);
    console.log("loading blogpost", content.blog);

    ssb
      .getBlob(content.blog)
      .then(data => {
        $$invalidate('post', post = ssb.markdown(data));
        $$invalidate('showBlogpost', showBlogpost = true);
      })
      .catch(err => {
        console.error("can't load blog post", err);
        $$invalidate('toast', toast = true);
        $$invalidate('toastMsg', toastMsg = err);
      });
  };

  const reply = ev => {
    let rootId = msg.value.content.root || msg.key;
    let channel = msg.value.content.channel;
    navigate("/compose", { root: rootId, branch: msg.key, channel });
  };

  const goRoot = ev => {
    let rootId = msg.value.content.root || msg.key;
    navigate("/thread", { thread: rootId });
  };

  const goBranch = ev => {
    let branchId = msg.value.content.branch || msg.key;
    navigate("/thread", { thread: branchId });
  };

  if ($routeLocation == "/thread") {
    setTimeout(displayBlogPost, 100);
  }

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1.warn(`<BlogMsg> was created with unknown prop '${key}'`);
	});

	function click_handler() {
		const $$result = (showBlogpost = false);
		$$invalidate('showBlogpost', showBlogpost);
		return $$result;
	}

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return {
		routeLocation,
		msg,
		summary,
		thumbnail,
		title,
		showBlogpost,
		loading,
		toast,
		toastMsg,
		post,
		liked,
		likeChanged,
		displayBlogPost,
		reply,
		goRoot,
		goBranch,
		click_handler
	};
}

class BlogMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-ygl8m2-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console_1.warn("<BlogMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<BlogMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<BlogMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = BlogMsg;

},{"../utils.js":30,"svelte/internal":8}],18:[function(require,module,exports){
/* ChannelMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");

const file = "ChannelMsg.svelte";

function create_fragment(ctx) {
	var div, t0, t1, t2, t3, a, t4, t5, a_href_value, dispose;

	return {
		c: function create() {
			div = element("div");
			t0 = text(ctx.person);
			t1 = space();
			t2 = text(ctx.verb);
			t3 = space();
			a = element("a");
			t4 = text("#");
			t5 = text(ctx.channel);
			attr(a, "href", a_href_value = "?channel=" + ctx.channel + "#/channel");
			add_location(a, file, 20, 2, 543);
			attr(div, "class", "card-body");
			add_location(div, file, 18, 0, 496);
			dispose = listen(a, "click", ctx.goChannel);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
			append(div, t2);
			append(div, t3);
			append(div, a);
			append(a, t4);
			append(a, t5);
		},

		p: function update(changed, ctx) {
			if (changed.person) {
				set_data(t0, ctx.person);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			dispose();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { navigate } = require("../utils.js");

  let { msg } = $$props;

  let person = msg.value.author;
  let verb = msg.value.content.subscribed ? "subscribed" : "unsubscribed";
  let channel = encodeURIComponent(msg.value.content.channel);

  ssb.avatar(msg.value.author).then(data => { const $$result = (person = data.name); $$invalidate('person', person); return $$result; });

   const goChannel = ev => {
    ev.stopPropagation();
    ev.preventDefault();
    navigate("/channel", { channel: msg.value.content.channel });
  };

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<ChannelMsg> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return { msg, person, verb, channel, goChannel };
}

class ChannelMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console.warn("<ChannelMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<ChannelMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<ChannelMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = ChannelMsg;

},{"../utils.js":30,"svelte/internal":8}],19:[function(require,module,exports){
/* ContactMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	globals,
	init,
	insert,
	listen,
	noop,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");

const { console: console_1 } = globals;

const file = "ContactMsg.svelte";

function create_fragment(ctx) {
	var div, t0, t1, t2, t3, a, t4, a_href_value, dispose;

	return {
		c: function create() {
			div = element("div");
			t0 = text(ctx.person);
			t1 = space();
			t2 = text(ctx.verb);
			t3 = space();
			a = element("a");
			t4 = text(ctx.otherPersonName);
			attr(a, "href", a_href_value = "?feed=" + ctx.otherPersonFeed + "#/profile");
			add_location(a, file, 31, 2, 797);
			attr(div, "class", "card-body");
			add_location(div, file, 29, 0, 750);
			dispose = listen(a, "click", ctx.goProfile);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
			append(div, t2);
			append(div, t3);
			append(div, a);
			append(a, t4);
		},

		p: function update(changed, ctx) {
			if (changed.person) {
				set_data(t0, ctx.person);
			}

			if (changed.verb) {
				set_data(t2, ctx.verb);
			}

			if (changed.otherPersonName) {
				set_data(t4, ctx.otherPersonName);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			dispose();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { navigate } = require("../utils.js");

  let { msg } = $$props;

  let person = msg.value.author;
  let otherPersonFeed = encodeURIComponent(msg.value.content.contact);
  let otherPersonName = otherPersonFeed;
  let verb = msg.value.content.following ? "followed" : "unfollowed";

  if (msg.value.content.blocking) {
    $$invalidate('verb', verb = "blocked");
  }

  ssb.avatar(msg.value.author).then(data => { const $$result = (person = data.name); $$invalidate('person', person); return $$result; });
  ssb
    .avatar(msg.value.content.contact)
    .then(data => {
      $$invalidate('otherPersonName', otherPersonName = data.name);
    })
    .catch(n => console.log(n));

  const goProfile = ev => {
    ev.stopPropagation();
    ev.preventDefault();
    navigate("/profile", { feed: msg.value.content.contact });
  };

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1.warn(`<ContactMsg> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return {
		msg,
		person,
		otherPersonFeed,
		otherPersonName,
		verb,
		goProfile
	};
}

class ContactMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console_1.warn("<ContactMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<ContactMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<ContactMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = ContactMsg;

},{"../utils.js":30,"svelte/internal":8}],20:[function(require,module,exports){
/* GenericMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	noop,
	safe_not_equal,
	text
} = require("svelte/internal");

const file = "GenericMsg.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-mp70wj-style';
	style.textContent = "pre.code.svelte-mp70wj{overflow:scroll}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2VuZXJpY01zZy5zdmVsdGUiLCJzb3VyY2VzIjpbIkdlbmVyaWNNc2cuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XHJcbiAgZXhwb3J0IGxldCBtc2c7XHJcblxyXG4gIGxldCByYXdDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkobXNnLCBudWxsLCAyKTtcclxuPC9zY3JpcHQ+XHJcbjxzdHlsZT5cclxucHJlLmNvZGUge1xyXG4gICAgb3ZlcmZsb3c6IHNjcm9sbDtcclxufVxyXG48L3N0eWxlPlxyXG5cclxuPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxyXG4gIDxwcmUgY2xhc3M9XCJjb2RlXCI+XHJcbiAgICA8Y29kZT4ge3Jhd0NvbnRlbnR9IDwvY29kZT5cclxuICA8L3ByZT5cclxuPC9kaXY+XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFNQSxHQUFHLEtBQUssY0FBQyxDQUFDLEFBQ04sUUFBUSxDQUFFLE1BQU0sQUFDcEIsQ0FBQyJ9 */";
	append(document.head, style);
}

function create_fragment(ctx) {
	var div, pre, code, t;

	return {
		c: function create() {
			div = element("div");
			pre = element("pre");
			code = element("code");
			t = text(ctx.rawContent);
			add_location(code, file, 13, 4, 202);
			attr(pre, "class", "code svelte-mp70wj");
			add_location(pre, file, 12, 2, 178);
			attr(div, "class", "card-body");
			add_location(div, file, 11, 0, 151);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, pre);
			append(pre, code);
			append(code, t);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { msg } = $$props;

  let rawContent = JSON.stringify(msg, null, 2);

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<GenericMsg> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return { msg, rawContent };
}

class GenericMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-mp70wj-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console.warn("<GenericMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<GenericMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<GenericMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = GenericMsg;

},{"svelte/internal":8}],21:[function(require,module,exports){
/* MessageRenderer.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	check_outros,
	destroy_component,
	detach,
	element,
	empty,
	globals,
	group_outros,
	init,
	insert,
	listen,
	mount_component,
	noop,
	prevent_default,
	run_all,
	safe_not_equal,
	set_data,
	space,
	text,
	toggle_class,
	transition_in,
	transition_out
} = require("svelte/internal");

const { console: console_1 } = globals;

const file = "MessageRenderer.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-1jn1wek-style';
	style.textContent = ".blured.svelte-1jn1wek img.svelte-1jn1wek{filter:blur(20px) !important}.blured.svelte-1jn1wek{border:solid 2px red}.feed-display.svelte-1jn1wek{cursor:pointer}.channel-display.svelte-1jn1wek{cursor:pointer}.menu-right.svelte-1jn1wek{right:0px;left:unset;min-width:300px}.private.svelte-1jn1wek{border:solid 2px orange}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWVzc2FnZVJlbmRlcmVyLnN2ZWx0ZSIsInNvdXJjZXMiOlsiTWVzc2FnZVJlbmRlcmVyLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxyXG4gIGNvbnN0IFBvc3RNc2cgPSByZXF1aXJlKFwiLi9Qb3N0TXNnLnN2ZWx0ZVwiKTtcclxuICBjb25zdCBHZW5lcmljTXNnID0gcmVxdWlyZShcIi4vR2VuZXJpY01zZy5zdmVsdGVcIik7XHJcbiAgY29uc3QgVm90ZU1zZyA9IHJlcXVpcmUoXCIuL1ZvdGVNc2cuc3ZlbHRlXCIpO1xyXG4gIGNvbnN0IFByaXZhdGVNc2cgPSByZXF1aXJlKFwiLi9Qcml2YXRlTXNnLnN2ZWx0ZVwiKTtcclxuICBjb25zdCBDb250YWN0TXNnID0gcmVxdWlyZShcIi4vQ29udGFjdE1zZy5zdmVsdGVcIik7XHJcbiAgY29uc3QgQ2hhbm5lbE1zZyA9IHJlcXVpcmUoXCIuL0NoYW5uZWxNc2cuc3ZlbHRlXCIpO1xyXG4gIGNvbnN0IEFib3V0TXNnID0gcmVxdWlyZShcIi4vQWJvdXRNc2cuc3ZlbHRlXCIpO1xyXG4gIGNvbnN0IFB1Yk1zZyA9IHJlcXVpcmUoXCIuL1B1Yk1zZy5zdmVsdGVcIik7XHJcbiAgY29uc3QgQmxvZ01zZyA9IHJlcXVpcmUoXCIuL0Jsb2dNc2cuc3ZlbHRlXCIpO1xyXG4gIGNvbnN0IEF2YXRhckNoaXAgPSByZXF1aXJlKFwiLi4vcGFydHMvQXZhdGFyQ2hpcC5zdmVsdGVcIik7XHJcbiAgY29uc3Qge3RpbWVzdGFtcH0gPSByZXF1aXJlKFwiLi4vcGFydHMvdGltZXN0YW1wLmpzXCIpO1xyXG4gIGNvbnN0IHsgbmF2aWdhdGUgfSA9IHJlcXVpcmUoXCIuLi91dGlscy5qc1wiKTtcclxuICBjb25zdCB7IGlzTWVzc2FnZUJsdXJlZCB9ID0gcmVxdWlyZShcIi4uL2FidXNlUHJldmVudGlvbi5qc1wiKTtcclxuXHJcbiAgZXhwb3J0IGxldCBtc2c7XHJcblxyXG4gIGxldCB0eXBlO1xyXG4gIGxldCBmZWVkID0gbXNnLnZhbHVlLmF1dGhvcjtcclxuICBsZXQgc2hvd1JhdyA9IGZhbHNlO1xyXG4gIGxldCByYXdDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkobXNnLCBudWxsLCAyKTtcclxuICBsZXQgZHJvcGRvd25BY3RpdmUgPSBmYWxzZTtcclxuICBsZXQgcHJpdmF0ZU1zZ0ZvcllvdSA9IGZhbHNlO1xyXG5cclxuICBsZXQgbWVzc2FnZVR5cGVzID0ge1xyXG4gICAgXCIqXCI6IEdlbmVyaWNNc2csXHJcbiAgICBwb3N0OiBQb3N0TXNnLFxyXG4gICAgdm90ZTogVm90ZU1zZyxcclxuICAgIHByaXZhdGU6IFByaXZhdGVNc2csXHJcbiAgICBjb250YWN0OiBDb250YWN0TXNnLFxyXG4gICAgY2hhbm5lbDogQ2hhbm5lbE1zZyxcclxuICAgIGFib3V0OiBBYm91dE1zZyxcclxuICAgIHB1YjogUHViTXNnLFxyXG4gICAgYmxvZzogQmxvZ01zZ1xyXG4gIH07XHJcblxyXG4gIGxldCBzZWxlY3RlZFJlbmRlcmVyO1xyXG5cclxuICBpZiAodHlwZW9mIG1zZy52YWx1ZS5jb250ZW50ID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICB0eXBlID0gXCJwcml2YXRlXCI7XHJcbiAgfSBlbHNlIHtcclxuICAgIHR5cGUgPSBtc2cudmFsdWUuY29udGVudC50eXBlO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1zZy52YWx1ZS5wcml2YXRlKSB7XHJcbiAgICBwcml2YXRlTXNnRm9yWW91ID0gdHJ1ZTtcclxuICB9XHJcblxyXG4gIGlmIChtZXNzYWdlVHlwZXMuaGFzT3duUHJvcGVydHkodHlwZSkpIHtcclxuICAgIHNlbGVjdGVkUmVuZGVyZXIgPSBtZXNzYWdlVHlwZXNbdHlwZV07XHJcbiAgfSBlbHNlIHtcclxuICAgIHNlbGVjdGVkUmVuZGVyZXIgPSBtZXNzYWdlVHlwZXNbXCIqXCJdO1xyXG4gIH1cclxuXHJcbiAgbGV0IGltYWdlID0gXCJpbWFnZXMvaWNvbi5wbmdcIjtcclxuICBsZXQgbmFtZSA9IGZlZWQ7XHJcbiAgbGV0IGJsdXJlZCA9IGlzTWVzc2FnZUJsdXJlZChtc2cpO1xyXG5cclxuICBzc2IuYXZhdGFyKGZlZWQpLnRoZW4oZGF0YSA9PiB7XHJcbiAgICBpZiAoZGF0YS5pbWFnZSAhPT0gbnVsbCkge1xyXG4gICAgICBpbWFnZSA9IGBodHRwOi8vbG9jYWxob3N0Ojg5ODkvYmxvYnMvZ2V0LyR7ZGF0YS5pbWFnZX1gO1xyXG4gICAgfVxyXG4gICAgbmFtZSA9IGRhdGEubmFtZTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgdG9nZ2xlUmF3TWVzc2FnZSA9ICgpID0+IHtcclxuICAgIHNob3dSYXcgPSAhc2hvd1JhdztcclxuICAgIGRyb3Bkb3duQWN0aXZlID0gZmFsc2U7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgY29weVBlcm1hbGluayA9ICgpID0+IHtcclxuICAgIG5hdmlnYXRvci5jbGlwYm9hcmRcclxuICAgICAgLndyaXRlVGV4dChgc3NiOiR7bXNnLmtleX1gKVxyXG4gICAgICAudGhlbigoKSA9PiBjb25zb2xlLmxvZyhcInBlcm1hbGluayBjb3BpZWRcIikpXHJcbiAgICAgIC5jYXRjaChlcnIgPT4gY29uc29sZS5lcnJvcihcImNhbid0IGNvcHkgcGVybWFsaW5rXCIsIGVycikpO1xyXG5cclxuICAgIGRyb3Bkb3duQWN0aXZlID0gZmFsc2U7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgY29weUhhc2ggPSAoKSA9PiB7XHJcbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkXHJcbiAgICAgIC53cml0ZVRleHQoYCR7bXNnLmtleX1gKVxyXG4gICAgICAudGhlbigoKSA9PiBjb25zb2xlLmxvZyhcImhhc2ggY29waWVkXCIpKVxyXG4gICAgICAuY2F0Y2goZXJyID0+IGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBjb3B5IGhhc2hcIiwgZXJyKSk7XHJcblxyXG4gICAgZHJvcGRvd25BY3RpdmUgPSBmYWxzZTtcclxuICB9O1xyXG5cclxuICBjb25zdCBnb1Byb2ZpbGUgPSBldiA9PiB7XHJcbiAgICBpZiAoZXYuY3RybEtleSkge1xyXG4gICAgICB3aW5kb3cub3BlbihgP2ZlZWQ9JHtlbmNvZGVVUklDb21wb25lbnQoZmVlZCl9Iy9wcm9maWxlYCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBuYXZpZ2F0ZShcIi9wcm9maWxlXCIsIHsgZmVlZCB9KTtcclxuICAgIH1cclxuICB9O1xyXG48L3NjcmlwdD5cclxuXHJcbjxzdHlsZT5cclxuICAuYmx1cmVkIGltZyB7XHJcbiAgICBmaWx0ZXI6IGJsdXIoMjBweCkgIWltcG9ydGFudDtcclxuICB9XHJcblxyXG4gIC5ibHVyZWQge1xyXG4gICAgYm9yZGVyOiBzb2xpZCAycHggcmVkO1xyXG4gIH1cclxuICAucmF3LWNvbnRlbnQge1xyXG4gICAgd2lkdGg6IDUwJTtcclxuICB9XHJcblxyXG4gIC5mZWVkLWRpc3BsYXkge1xyXG4gICAgY3Vyc29yOiBwb2ludGVyO1xyXG4gIH1cclxuXHJcbiAgLmNoYW5uZWwtZGlzcGxheSB7XHJcbiAgICBjdXJzb3I6IHBvaW50ZXI7XHJcbiAgfVxyXG5cclxuICAubWVudS1yaWdodCB7XHJcbiAgICByaWdodDogMHB4O1xyXG4gICAgbGVmdDogdW5zZXQ7XHJcbiAgICBtaW4td2lkdGg6IDMwMHB4O1xyXG4gIH1cclxuXHJcbiAgLnByaXZhdGUge1xyXG4gICAgYm9yZGVyOiBzb2xpZCAycHggb3JhbmdlO1xyXG4gIH1cclxuPC9zdHlsZT5cclxuXHJcbjxkaXYgY2xhc3M9XCJjYXJkIG0tMlwiIGNsYXNzOnByaXZhdGU9e3ByaXZhdGVNc2dGb3JZb3V9IGNsYXNzOmJsdXJlZD5cclxuICA8ZGl2IGNsYXNzPVwiY2FyZC1oZWFkZXJcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJmbG9hdC1sZWZ0XCI+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLXRpdGxlXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInRpbGUgdGlsZS1jZW50ZXJlZCBmZWVkLWRpc3BsYXlcIiBvbjpjbGljaz17Z29Qcm9maWxlfT5cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJ0aWxlLWljb25cIj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImV4YW1wbGUtdGlsZS1pY29uXCI+XHJcbiAgICAgICAgICAgICAgPGltZyBzcmM9e2ltYWdlfSBjbGFzcz1cImF2YXRhciBhdmF0YXItbGdcIiBhbHQ9e2ZlZWR9IC8+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwidGlsZS1jb250ZW50XCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJ0aWxlLXRpdGxlXCI+e25hbWV9PC9kaXY+XHJcbiAgICAgICAgICAgIDxzbWFsbCBjbGFzcz1cInRpbGUtc3VidGl0bGUgdGV4dC1ncmF5XCI+XHJcbiAgICAgICAgICAgICAgIHt0aW1lc3RhbXAobXNnLnZhbHVlLnRpbWVzdGFtcCl9XHJcbiAgICAgICAgICAgIDwvc21hbGw+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuICAgIHsjaWYgcHJpdmF0ZU1zZ0ZvcllvdX1cclxuICAgICAgPHNwYW4gY2xhc3M9XCJsYWJlbFwiPlBSSVZBVEU8L3NwYW4+XHJcbiAgICB7L2lmfVxyXG4gICAgPGRpdiBjbGFzcz1cImZsb2F0LXJpZ2h0XCI+XHJcbiAgICAgIDxzcGFuXHJcbiAgICAgICAgY2xhc3M9XCJ0ZXh0LWdyYXkgY2hhbm5lbC1kaXNwbGF5XCJcclxuICAgICAgICBvbjpjbGljaz17KCkgPT4gbmF2aWdhdGUoJy9jaGFubmVsJywge1xyXG4gICAgICAgICAgICBjaGFubmVsOiBtc2cudmFsdWUuY29udGVudC5jaGFubmVsXHJcbiAgICAgICAgICB9KX0+XHJcbiAgICAgICAgeyNpZiBtc2cudmFsdWUuY29udGVudC5jaGFubmVsfSN7bXNnLnZhbHVlLmNvbnRlbnQuY2hhbm5lbH17L2lmfVxyXG4gICAgICA8L3NwYW4+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJkcm9wZG93blwiPlxyXG4gICAgICAgIDxzcGFuXHJcbiAgICAgICAgICBjbGFzcz1cImJ0biBidG4tbGluayBkcm9wZG93bi10b2dnbGVcIlxyXG4gICAgICAgICAgdGFiaW5kZXg9XCIwXCJcclxuICAgICAgICAgIGNsYXNzOmFjdGl2ZT17ZHJvcGRvd25BY3RpdmV9XHJcbiAgICAgICAgICBvbjpjbGljaz17KCkgPT4gKGRyb3Bkb3duQWN0aXZlID0gIWRyb3Bkb3duQWN0aXZlKX0+XHJcbiAgICAgICAgICA8aSBjbGFzcz1cImljb24gaWNvbi1tb3JlLXZlcnRcIiAvPlxyXG4gICAgICAgIDwvc3Bhbj5cclxuICAgICAgICA8dWwgY2xhc3M9XCJtZW51IG1lbnUtcmlnaHRcIj5cclxuICAgICAgICAgIDxsaSBjbGFzcz1cIm1lbnUtaXRlbVwiPlxyXG5cclxuICAgICAgICAgICAgPGFcclxuICAgICAgICAgICAgICBocmVmPVwiP3RocmVhZD17ZW5jb2RlVVJJQ29tcG9uZW50KG1zZy5rZXkpfSMvdGhyZWFkXCJcclxuICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIj5cclxuICAgICAgICAgICAgICA8aSBjbGFzcz1cImljb24gaWNvbi1zaGFyZVwiIC8+XHJcbiAgICAgICAgICAgICAgT3BlbiBpbiBuZXcgdGFiXHJcbiAgICAgICAgICAgIDwvYT5cclxuICAgICAgICAgIDwvbGk+XHJcbiAgICAgICAgICA8bGkgY2xhc3M9XCJtZW51LWl0ZW1cIj5cclxuICAgICAgICAgICAgPGEgaHJlZj1cIiNcIiBvbjpjbGlja3xwcmV2ZW50RGVmYXVsdD17Y29weVBlcm1hbGlua30+XHJcbiAgICAgICAgICAgICAgPGkgY2xhc3M9XCJpY29uIGljb24tY29weVwiIC8+XHJcbiAgICAgICAgICAgICAgQ29weSBwZXJtYWxpbmsgdG8gY2xpcGJvYXJkXHJcbiAgICAgICAgICAgIDwvYT5cclxuICAgICAgICAgIDwvbGk+XHJcbiAgICAgICAgICA8bGkgY2xhc3M9XCJtZW51LWl0ZW1cIj5cclxuICAgICAgICAgICAgPGEgaHJlZj1cIiNcIiBvbjpjbGlja3xwcmV2ZW50RGVmYXVsdD17Y29weUhhc2h9PlxyXG4gICAgICAgICAgICAgIDxpIGNsYXNzPVwiaWNvbiBpY29uLWNvcHlcIiAvPlxyXG4gICAgICAgICAgICAgIENvcHkgbWVzc2FnZSBpZCB0byBjbGlwYm9hcmRcclxuICAgICAgICAgICAgPC9hPlxyXG4gICAgICAgICAgPC9saT5cclxuICAgICAgICAgIDxsaSBjbGFzcz1cImRpdmlkZXJcIiBkYXRhLWNvbnRlbnQ9XCJGT1IgVEhFIENVUklPVVNcIiAvPlxyXG4gICAgICAgICAgPGxpIGNsYXNzPVwibWVudS1pdGVtXCI+XHJcbiAgICAgICAgICAgIDxhIGhyZWY9XCIjXCIgb246Y2xpY2t8cHJldmVudERlZmF1bHQ9e3RvZ2dsZVJhd01lc3NhZ2V9PlxyXG4gICAgICAgICAgICAgIDxpIGNsYXNzPVwiaWNvbiBpY29uLW1lc3NhZ2VcIiAvPlxyXG4gICAgICAgICAgICAgIHsjaWYgIXNob3dSYXd9U2hvdyByYXcgbWVzc2FnZXs6ZWxzZX1DbG9zZSByYXcgbWVzc2FnZXsvaWZ9XHJcbiAgICAgICAgICAgIDwvYT5cclxuICAgICAgICAgIDwvbGk+XHJcbiAgICAgICAgPC91bD5cclxuICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuICA8L2Rpdj5cclxuICB7I2lmICFzaG93UmF3fVxyXG4gICAgPHN2ZWx0ZTpjb21wb25lbnQgdGhpcz17c2VsZWN0ZWRSZW5kZXJlcn0ge21zZ30gLz5cclxuICB7OmVsc2V9XHJcbiAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW5zXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbHVtbiBjb2wtOVwiPlxyXG4gICAgICAgICAgPHByZSBjbGFzcz1cImNvZGVcIj5cclxuICAgICAgICAgICAgPGNvZGU+e3Jhd0NvbnRlbnR9PC9jb2RlPlxyXG4gICAgICAgICAgPC9wcmU+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbHVtbiBjb2wtM1wiPlxyXG4gICAgICAgICAgPHA+XHJcbiAgICAgICAgICAgIFRoaXMgaXMgYSBtZXNzYWdlIG9mIHR5cGVcclxuICAgICAgICAgICAgPGVtPnt0eXBlfTwvZW0+XHJcbiAgICAgICAgICAgIC5cclxuICAgICAgICAgIDwvcD5cclxuICAgICAgICAgIDxwPlxyXG4gICAgICAgICAgICBUbyBsZWFybiBtb3JlIGFib3V0IGl0LCBnbyB0b1xyXG4gICAgICAgICAgICA8YSB0YXJnZXQ9XCJfYmxhbmtcIiBocmVmPVwiL2RvY3MvaW5kZXguaHRtbCMvbWVzc2FnZV90eXBlcy97dHlwZX1cIj5cclxuICAgICAgICAgICAgICB0aGUgZG9jdW1lbnRhdGlvbiBhYm91dCBtZXNzYWdlcyB3aXRoIHR5cGUge3R5cGV9XHJcbiAgICAgICAgICAgIDwvYT5cclxuICAgICAgICAgICAgLlxyXG4gICAgICAgICAgPC9wPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG4gIHsvaWZ9XHJcbjwvZGl2PlxyXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBa0dFLHNCQUFPLENBQUMsR0FBRyxlQUFDLENBQUMsQUFDWCxNQUFNLENBQUUsS0FBSyxJQUFJLENBQUMsQ0FBQyxVQUFVLEFBQy9CLENBQUMsQUFFRCxPQUFPLGVBQUMsQ0FBQyxBQUNQLE1BQU0sQ0FBRSxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQUFDdkIsQ0FBQyxBQUtELGFBQWEsZUFBQyxDQUFDLEFBQ2IsTUFBTSxDQUFFLE9BQU8sQUFDakIsQ0FBQyxBQUVELGdCQUFnQixlQUFDLENBQUMsQUFDaEIsTUFBTSxDQUFFLE9BQU8sQUFDakIsQ0FBQyxBQUVELFdBQVcsZUFBQyxDQUFDLEFBQ1gsS0FBSyxDQUFFLEdBQUcsQ0FDVixJQUFJLENBQUUsS0FBSyxDQUNYLFNBQVMsQ0FBRSxLQUFLLEFBQ2xCLENBQUMsQUFFRCxRQUFRLGVBQUMsQ0FBQyxBQUNSLE1BQU0sQ0FBRSxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQUFDMUIsQ0FBQyJ9 */";
	append(document.head, style);
}

// (148:4) {#if privateMsgForYou}
function create_if_block_3(ctx) {
	var span;

	return {
		c: function create() {
			span = element("span");
			span.textContent = "PRIVATE";
			attr(span, "class", "label");
			add_location(span, file, 148, 6, 3678);
		},

		m: function mount(target, anchor) {
			insert(target, span, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(span);
			}
		}
	};
}

// (157:8) {#if msg.value.content.channel}
function create_if_block_2(ctx) {
	var t0, t1_value = ctx.msg.value.content.channel, t1;

	return {
		c: function create() {
			t0 = text("#");
			t1 = text(t1_value);
		},

		m: function mount(target, anchor) {
			insert(target, t0, anchor);
			insert(target, t1, anchor);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && t1_value !== (t1_value = ctx.msg.value.content.channel)) {
				set_data(t1, t1_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(t0);
				detach(t1);
			}
		}
	};
}

// (193:44) {:else}
function create_else_block_1(ctx) {
	var t;

	return {
		c: function create() {
			t = text("Close raw message");
		},

		m: function mount(target, anchor) {
			insert(target, t, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(t);
			}
		}
	};
}

// (193:14) {#if !showRaw}
function create_if_block_1(ctx) {
	var t;

	return {
		c: function create() {
			t = text("Show raw message");
		},

		m: function mount(target, anchor) {
			insert(target, t, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(t);
			}
		}
	};
}

// (202:2) {:else}
function create_else_block(ctx) {
	var div3, div2, div0, pre, code, t0, t1, div1, p0, t2, em, t3, t4, t5, p1, t6, a, t7, t8, a_href_value, t9;

	return {
		c: function create() {
			div3 = element("div");
			div2 = element("div");
			div0 = element("div");
			pre = element("pre");
			code = element("code");
			t0 = text(ctx.rawContent);
			t1 = space();
			div1 = element("div");
			p0 = element("p");
			t2 = text("This is a message of type\r\n            ");
			em = element("em");
			t3 = text(ctx.type);
			t4 = text("\r\n            .");
			t5 = space();
			p1 = element("p");
			t6 = text("To learn more about it, go to\r\n            ");
			a = element("a");
			t7 = text("the documentation about messages with type ");
			t8 = text(ctx.type);
			t9 = text("\r\n            .");
			add_location(code, file, 206, 12, 5635);
			attr(pre, "class", "code");
			add_location(pre, file, 205, 10, 5603);
			attr(div0, "class", "column col-9");
			add_location(div0, file, 204, 8, 5565);
			add_location(em, file, 212, 12, 5798);
			add_location(p0, file, 210, 10, 5742);
			attr(a, "target", "_blank");
			attr(a, "href", a_href_value = "/docs/index.html#/message_types/" + ctx.type);
			add_location(a, file, 217, 12, 5916);
			add_location(p1, file, 215, 10, 5856);
			attr(div1, "class", "column col-3");
			add_location(div1, file, 209, 8, 5704);
			attr(div2, "class", "columns");
			add_location(div2, file, 203, 6, 5534);
			attr(div3, "class", "card-body");
			add_location(div3, file, 202, 4, 5503);
		},

		m: function mount(target, anchor) {
			insert(target, div3, anchor);
			append(div3, div2);
			append(div2, div0);
			append(div0, pre);
			append(pre, code);
			append(code, t0);
			append(div2, t1);
			append(div2, div1);
			append(div1, p0);
			append(p0, t2);
			append(p0, em);
			append(em, t3);
			append(p0, t4);
			append(div1, t5);
			append(div1, p1);
			append(p1, t6);
			append(p1, a);
			append(a, t7);
			append(a, t8);
			append(p1, t9);
		},

		p: function update(changed, ctx) {
			if (changed.type) {
				set_data(t3, ctx.type);
				set_data(t8, ctx.type);
			}

			if ((changed.type) && a_href_value !== (a_href_value = "/docs/index.html#/message_types/" + ctx.type)) {
				attr(a, "href", a_href_value);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div3);
			}
		}
	};
}

// (200:2) {#if !showRaw}
function create_if_block(ctx) {
	var switch_instance_anchor, current;

	var switch_value = ctx.selectedRenderer;

	function switch_props(ctx) {
		return {
			props: { msg: ctx.msg },
			$$inline: true
		};
	}

	if (switch_value) {
		var switch_instance = new switch_value(switch_props(ctx));
	}

	return {
		c: function create() {
			if (switch_instance) switch_instance.$$.fragment.c();
			switch_instance_anchor = empty();
		},

		m: function mount(target, anchor) {
			if (switch_instance) {
				mount_component(switch_instance, target, anchor);
			}

			insert(target, switch_instance_anchor, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			var switch_instance_changes = {};
			if (changed.msg) switch_instance_changes.msg = ctx.msg;

			if (switch_value !== (switch_value = ctx.selectedRenderer)) {
				if (switch_instance) {
					group_outros();
					const old_component = switch_instance;
					transition_out(old_component.$$.fragment, 1, 0, () => {
						destroy_component(old_component, 1);
					});
					check_outros();
				}

				if (switch_value) {
					switch_instance = new switch_value(switch_props(ctx));

					switch_instance.$$.fragment.c();
					transition_in(switch_instance.$$.fragment, 1);
					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
				} else {
					switch_instance = null;
				}
			}

			else if (switch_value) {
				switch_instance.$set(switch_instance_changes);
			}
		},

		i: function intro(local) {
			if (current) return;
			if (switch_instance) transition_in(switch_instance.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(switch_instance_anchor);
			}

			if (switch_instance) destroy_component(switch_instance, detaching);
		}
	};
}

function create_fragment(ctx) {
	var div10, div9, div6, div5, div4, div1, div0, img, t0, div3, div2, t1, t2, small, t3_value = ctx.timestamp(ctx.msg.value.timestamp), t3, t4, t5, div8, span0, t6, div7, span1, i0, t7, ul, li0, a0, i1, t8, a0_href_value, t9, li1, a1, i2, t10, t11, li2, a2, i3, t12, t13, li3, t14, li4, a3, i4, t15, t16, current_block_type_index, if_block3, current, dispose;

	var if_block0 = (ctx.privateMsgForYou) && create_if_block_3(ctx);

	var if_block1 = (ctx.msg.value.content.channel) && create_if_block_2(ctx);

	function select_block_type(ctx) {
		if (!ctx.showRaw) return create_if_block_1;
		return create_else_block_1;
	}

	var current_block_type = select_block_type(ctx);
	var if_block2 = current_block_type(ctx);

	var if_block_creators = [
		create_if_block,
		create_else_block
	];

	var if_blocks = [];

	function select_block_type_1(ctx) {
		if (!ctx.showRaw) return 0;
		return 1;
	}

	current_block_type_index = select_block_type_1(ctx);
	if_block3 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c: function create() {
			div10 = element("div");
			div9 = element("div");
			div6 = element("div");
			div5 = element("div");
			div4 = element("div");
			div1 = element("div");
			div0 = element("div");
			img = element("img");
			t0 = space();
			div3 = element("div");
			div2 = element("div");
			t1 = text(ctx.name);
			t2 = space();
			small = element("small");
			t3 = text(t3_value);
			t4 = space();
			if (if_block0) if_block0.c();
			t5 = space();
			div8 = element("div");
			span0 = element("span");
			if (if_block1) if_block1.c();
			t6 = space();
			div7 = element("div");
			span1 = element("span");
			i0 = element("i");
			t7 = space();
			ul = element("ul");
			li0 = element("li");
			a0 = element("a");
			i1 = element("i");
			t8 = text("\r\n              Open in new tab");
			t9 = space();
			li1 = element("li");
			a1 = element("a");
			i2 = element("i");
			t10 = text("\r\n              Copy permalink to clipboard");
			t11 = space();
			li2 = element("li");
			a2 = element("a");
			i3 = element("i");
			t12 = text("\r\n              Copy message id to clipboard");
			t13 = space();
			li3 = element("li");
			t14 = space();
			li4 = element("li");
			a3 = element("a");
			i4 = element("i");
			t15 = space();
			if_block2.c();
			t16 = space();
			if_block3.c();
			attr(img, "src", ctx.image);
			attr(img, "class", "avatar avatar-lg svelte-1jn1wek");
			attr(img, "alt", ctx.feed);
			add_location(img, file, 135, 14, 3277);
			attr(div0, "class", "example-tile-icon");
			add_location(div0, file, 134, 12, 3230);
			attr(div1, "class", "tile-icon");
			add_location(div1, file, 133, 10, 3193);
			attr(div2, "class", "tile-title");
			add_location(div2, file, 139, 12, 3422);
			attr(small, "class", "tile-subtitle text-gray");
			add_location(small, file, 140, 12, 3472);
			attr(div3, "class", "tile-content");
			add_location(div3, file, 138, 10, 3382);
			attr(div4, "class", "tile tile-centered feed-display svelte-1jn1wek");
			add_location(div4, file, 132, 8, 3115);
			attr(div5, "class", "card-title");
			add_location(div5, file, 131, 6, 3081);
			attr(div6, "class", "float-left");
			add_location(div6, file, 130, 4, 3049);
			attr(span0, "class", "text-gray channel-display svelte-1jn1wek");
			add_location(span0, file, 151, 6, 3762);
			attr(i0, "class", "icon icon-more-vert");
			add_location(i0, file, 164, 10, 4245);
			attr(span1, "class", "btn btn-link dropdown-toggle");
			attr(span1, "tabindex", "0");
			toggle_class(span1, "active", ctx.dropdownActive);
			add_location(span1, file, 159, 8, 4051);
			attr(i1, "class", "icon icon-share");
			add_location(i1, file, 172, 14, 4501);
			attr(a0, "href", a0_href_value = "?thread=" + ctx.encodeURIComponent(ctx.msg.key) + "#/thread");
			attr(a0, "target", "_blank");
			add_location(a0, file, 169, 12, 4383);
			attr(li0, "class", "menu-item");
			add_location(li0, file, 167, 10, 4345);
			attr(i2, "class", "icon icon-copy");
			add_location(i2, file, 178, 14, 4712);
			attr(a1, "href", "#");
			add_location(a1, file, 177, 12, 4644);
			attr(li1, "class", "menu-item");
			add_location(li1, file, 176, 10, 4608);
			attr(i3, "class", "icon icon-copy");
			add_location(i3, file, 184, 14, 4929);
			attr(a2, "href", "#");
			add_location(a2, file, 183, 12, 4866);
			attr(li2, "class", "menu-item");
			add_location(li2, file, 182, 10, 4830);
			attr(li3, "class", "divider");
			attr(li3, "data-content", "FOR THE CURIOUS");
			add_location(li3, file, 188, 10, 5048);
			attr(i4, "class", "icon icon-message");
			add_location(i4, file, 191, 14, 5220);
			attr(a3, "href", "#");
			add_location(a3, file, 190, 12, 5149);
			attr(li4, "class", "menu-item");
			add_location(li4, file, 189, 10, 5113);
			attr(ul, "class", "menu menu-right svelte-1jn1wek");
			add_location(ul, file, 166, 8, 4305);
			attr(div7, "class", "dropdown");
			add_location(div7, file, 158, 6, 4019);
			attr(div8, "class", "float-right");
			add_location(div8, file, 150, 4, 3729);
			attr(div9, "class", "card-header");
			add_location(div9, file, 129, 2, 3018);
			attr(div10, "class", "card m-2 svelte-1jn1wek");
			toggle_class(div10, "private", ctx.privateMsgForYou);
			toggle_class(div10, "blured", ctx.blured);
			add_location(div10, file, 128, 0, 2946);

			dispose = [
				listen(div4, "click", ctx.goProfile),
				listen(span0, "click", ctx.click_handler),
				listen(span1, "click", ctx.click_handler_1),
				listen(a1, "click", prevent_default(ctx.copyPermalink)),
				listen(a2, "click", prevent_default(ctx.copyHash)),
				listen(a3, "click", prevent_default(ctx.toggleRawMessage))
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div10, anchor);
			append(div10, div9);
			append(div9, div6);
			append(div6, div5);
			append(div5, div4);
			append(div4, div1);
			append(div1, div0);
			append(div0, img);
			append(div4, t0);
			append(div4, div3);
			append(div3, div2);
			append(div2, t1);
			append(div3, t2);
			append(div3, small);
			append(small, t3);
			append(div9, t4);
			if (if_block0) if_block0.m(div9, null);
			append(div9, t5);
			append(div9, div8);
			append(div8, span0);
			if (if_block1) if_block1.m(span0, null);
			append(div8, t6);
			append(div8, div7);
			append(div7, span1);
			append(span1, i0);
			append(div7, t7);
			append(div7, ul);
			append(ul, li0);
			append(li0, a0);
			append(a0, i1);
			append(a0, t8);
			append(ul, t9);
			append(ul, li1);
			append(li1, a1);
			append(a1, i2);
			append(a1, t10);
			append(ul, t11);
			append(ul, li2);
			append(li2, a2);
			append(a2, i3);
			append(a2, t12);
			append(ul, t13);
			append(ul, li3);
			append(ul, t14);
			append(ul, li4);
			append(li4, a3);
			append(a3, i4);
			append(a3, t15);
			if_block2.m(a3, null);
			append(div10, t16);
			if_blocks[current_block_type_index].m(div10, null);
			current = true;
		},

		p: function update(changed, ctx) {
			if (!current || changed.image) {
				attr(img, "src", ctx.image);
			}

			if (!current || changed.name) {
				set_data(t1, ctx.name);
			}

			if ((!current || changed.msg) && t3_value !== (t3_value = ctx.timestamp(ctx.msg.value.timestamp))) {
				set_data(t3, t3_value);
			}

			if (ctx.privateMsgForYou) {
				if (!if_block0) {
					if_block0 = create_if_block_3(ctx);
					if_block0.c();
					if_block0.m(div9, t5);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.msg.value.content.channel) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_2(ctx);
					if_block1.c();
					if_block1.m(span0, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (changed.dropdownActive) {
				toggle_class(span1, "active", ctx.dropdownActive);
			}

			if ((!current || changed.msg) && a0_href_value !== (a0_href_value = "?thread=" + ctx.encodeURIComponent(ctx.msg.key) + "#/thread")) {
				attr(a0, "href", a0_href_value);
			}

			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
				if_block2.d(1);
				if_block2 = current_block_type(ctx);
				if (if_block2) {
					if_block2.c();
					if_block2.m(a3, null);
				}
			}

			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type_1(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block3 = if_blocks[current_block_type_index];
				if (!if_block3) {
					if_block3 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block3.c();
				}
				transition_in(if_block3, 1);
				if_block3.m(div10, null);
			}

			if (changed.privateMsgForYou) {
				toggle_class(div10, "private", ctx.privateMsgForYou);
			}

			if (changed.blured) {
				toggle_class(div10, "blured", ctx.blured);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(if_block3);
			current = true;
		},

		o: function outro(local) {
			transition_out(if_block3);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div10);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if_block2.d();
			if_blocks[current_block_type_index].d();
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const PostMsg = require("./PostMsg.svelte");
  const GenericMsg = require("./GenericMsg.svelte");
  const VoteMsg = require("./VoteMsg.svelte");
  const PrivateMsg = require("./PrivateMsg.svelte");
  const ContactMsg = require("./ContactMsg.svelte");
  const ChannelMsg = require("./ChannelMsg.svelte");
  const AboutMsg = require("./AboutMsg.svelte");
  const PubMsg = require("./PubMsg.svelte");
  const BlogMsg = require("./BlogMsg.svelte");
  const AvatarChip = require("../parts/AvatarChip.svelte");
  const {timestamp} = require("../parts/timestamp.js");
  const { navigate } = require("../utils.js");
  const { isMessageBlured } = require("../abusePrevention.js");

  let { msg } = $$props;

  let type;
  let feed = msg.value.author;
  let showRaw = false;
  let rawContent = JSON.stringify(msg, null, 2);
  let dropdownActive = false;
  let privateMsgForYou = false;

  let messageTypes = {
    "*": GenericMsg,
    post: PostMsg,
    vote: VoteMsg,
    private: PrivateMsg,
    contact: ContactMsg,
    channel: ChannelMsg,
    about: AboutMsg,
    pub: PubMsg,
    blog: BlogMsg
  };

  let selectedRenderer;

  if (typeof msg.value.content === "string") {
    $$invalidate('type', type = "private");
  } else {
    $$invalidate('type', type = msg.value.content.type);
  }

  if (msg.value.private) {
    $$invalidate('privateMsgForYou', privateMsgForYou = true);
  }

  if (messageTypes.hasOwnProperty(type)) {
    $$invalidate('selectedRenderer', selectedRenderer = messageTypes[type]);
  } else {
    $$invalidate('selectedRenderer', selectedRenderer = messageTypes["*"]);
  }

  let image = "images/icon.png";
  let name = feed;
  let blured = isMessageBlured(msg);

  ssb.avatar(feed).then(data => {
    if (data.image !== null) {
      $$invalidate('image', image = `http://localhost:8989/blobs/get/${data.image}`);
    }
    $$invalidate('name', name = data.name);
  });

  const toggleRawMessage = () => {
    $$invalidate('showRaw', showRaw = !showRaw);
    $$invalidate('dropdownActive', dropdownActive = false);
  };

  const copyPermalink = () => {
    navigator.clipboard
      .writeText(`ssb:${msg.key}`)
      .then(() => console.log("permalink copied"))
      .catch(err => console.error("can't copy permalink", err));

    $$invalidate('dropdownActive', dropdownActive = false);
  };

  const copyHash = () => {
    navigator.clipboard
      .writeText(`${msg.key}`)
      .then(() => console.log("hash copied"))
      .catch(err => console.error("can't copy hash", err));

    $$invalidate('dropdownActive', dropdownActive = false);
  };

  const goProfile = ev => {
    if (ev.ctrlKey) {
      window.open(`?feed=${encodeURIComponent(feed)}#/profile`);
    } else {
      navigate("/profile", { feed });
    }
  };

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1.warn(`<MessageRenderer> was created with unknown prop '${key}'`);
	});

	function click_handler() {
		return navigate('/channel', {
	            channel: msg.value.content.channel
	          });
	}

	function click_handler_1() {
		const $$result = (dropdownActive = !dropdownActive);
		$$invalidate('dropdownActive', dropdownActive);
		return $$result;
	}

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return {
		timestamp,
		navigate,
		msg,
		type,
		feed,
		showRaw,
		rawContent,
		dropdownActive,
		privateMsgForYou,
		selectedRenderer,
		image,
		name,
		blured,
		toggleRawMessage,
		copyPermalink,
		copyHash,
		goProfile,
		encodeURIComponent,
		click_handler,
		click_handler_1
	};
}

class MessageRenderer extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-1jn1wek-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console_1.warn("<MessageRenderer> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<MessageRenderer>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<MessageRenderer>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = MessageRenderer;

},{"../abusePrevention.js":14,"../parts/AvatarChip.svelte":26,"../parts/timestamp.js":27,"../utils.js":30,"./AboutMsg.svelte":16,"./BlogMsg.svelte":17,"./ChannelMsg.svelte":18,"./ContactMsg.svelte":19,"./GenericMsg.svelte":20,"./PostMsg.svelte":22,"./PrivateMsg.svelte":23,"./PubMsg.svelte":24,"./VoteMsg.svelte":25,"svelte/internal":8}],22:[function(require,module,exports){
/* PostMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	HtmlTag,
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	globals,
	init,
	insert,
	listen,
	noop,
	prevent_default,
	run_all,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");

const { console: console_1 } = globals;

const file = "PostMsg.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-1ftdgav-style';
	style.textContent = ".card-body.svelte-1ftdgav{overflow-wrap:break-word}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdE1zZy5zdmVsdGUiLCJzb3VyY2VzIjpbIlBvc3RNc2cuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XHJcbiAgY29uc3QgeyBuYXZpZ2F0ZSB9ID0gcmVxdWlyZShcIi4uL3V0aWxzLmpzXCIpO1xyXG4gIGNvbnN0IHsgZ2V0UHJlZiB9ID0gcmVxdWlyZShcIi4uL3ByZWZzLmpzXCIpXHJcblxyXG4gIGV4cG9ydCBsZXQgbXNnO1xyXG4gIGxldCBjb250ZW50V2FybmluZ3NFeHBhbmRCeURlZmF1bHQgPSBnZXRQcmVmKFwiY29udGVudC13YXJuaW5ncy1leHBhbmRcIiwgXCJjb2xsYXBzZWRcIilcclxuICBsZXQgY29udGVudCA9IHNzYi5tYXJrZG93bihtc2cudmFsdWUuY29udGVudC50ZXh0KTtcclxuICBsZXQgbGlrZWQgPSBmYWxzZTtcclxuICBsZXQgaGFzQ29udGVudFdhcm5pbmcgPSBtc2cudmFsdWUuY29udGVudC5jb250ZW50V2FybmluZyB8fCBmYWxzZTtcclxuICBsZXQgc2hvd0NvbnRlbnRXYXJuaW5nID0gY29udGVudFdhcm5pbmdzRXhwYW5kQnlEZWZhdWx0ID09PSBcImNvbGxhcHNlZFwiO1xyXG5cclxuICBzc2Iudm90ZXMobXNnLmtleSkudGhlbihtcyA9PiB7XHJcbiAgICBtcy5mb3JFYWNoKG0gPT4ge1xyXG4gICAgICBsZXQgYXV0aG9yID0gbS52YWx1ZS5hdXRob3I7XHJcbiAgICAgIGlmIChhdXRob3IgPT09IHNzYi5mZWVkICYmIG0udmFsdWUuY29udGVudC52b3RlLnZhbHVlID09PSAxKSB7XHJcbiAgICAgICAgbGlrZWQgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgbGlrZUNoYW5nZWQgPSBldiA9PiB7XHJcbiAgICBsZXQgdiA9IGV2LnRhcmdldC5jaGVja2VkO1xyXG4gICAgaWYgKHYpIHtcclxuICAgICAgc3NiXHJcbiAgICAgICAgLmxpa2UobXNnLmtleSlcclxuICAgICAgICAudGhlbigoKSA9PiBjb25zb2xlLmxvZyhcImxpa2VkXCIsIG1zZy5rZXkpKVxyXG4gICAgICAgIC5jYXRjaCgoKSA9PiAobGlrZWQgPSBmYWxzZSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgc3NiXHJcbiAgICAgICAgLnVubGlrZShtc2cua2V5KVxyXG4gICAgICAgIC50aGVuKCgpID0+IGNvbnNvbGUubG9nKFwidW5saWtlZFwiLCBtc2cua2V5KSlcclxuICAgICAgICAuY2F0Y2goKCkgPT4gKGxpa2VkID0gdHJ1ZSkpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIGNvbnN0IHJlcGx5ID0gZXYgPT4ge1xyXG4gICAgbGV0IHJvb3QgPSBtc2cudmFsdWUuY29udGVudC5yb290IHx8IG1zZy5rZXk7XHJcbiAgICBsZXQgY2hhbm5lbCA9IG1zZy52YWx1ZS5jb250ZW50LmNoYW5uZWw7XHJcbiAgICBsZXQgcmVwbHlmZWVkID0gbXNnLnZhbHVlLmF1dGhvcjtcclxuICAgIG5hdmlnYXRlKFwiL2NvbXBvc2VcIiwgeyByb290LCBicmFuY2g6IG1zZy5rZXksIGNoYW5uZWwsIHJlcGx5ZmVlZCB9KTtcclxuICB9O1xyXG5cclxuICBjb25zdCBmb3JrID0gZXYgPT4ge1xyXG4gICAgbGV0IG9yaWdpbmFsUm9vdCA9IG1zZy52YWx1ZS5jb250ZW50LnJvb3QgfHwgbXNnLmtleTtcclxuICAgIGxldCBjaGFubmVsID0gbXNnLnZhbHVlLmNvbnRlbnQuY2hhbm5lbDtcclxuICAgIGxldCByZXBseWZlZWQgPSBtc2cudmFsdWUuYXV0aG9yO1xyXG4gICAgbmF2aWdhdGUoXCIvY29tcG9zZVwiLCB7XHJcbiAgICAgIHJvb3Q6IG1zZy5rZXksXHJcbiAgICAgIGJyYW5jaDogbXNnLmtleSxcclxuICAgICAgZm9yazogb3JpZ2luYWxSb290LFxyXG4gICAgICBjaGFubmVsLFxyXG4gICAgICByZXBseWZlZWRcclxuICAgIH0pO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGdvUm9vdCA9IGV2ID0+IHtcclxuICAgIGxldCByb290SWQgPSBtc2cudmFsdWUuY29udGVudC5yb290IHx8IG1zZy5rZXk7XHJcbiAgICBuYXZpZ2F0ZShcIi90aHJlYWRcIiwgeyB0aHJlYWQ6IHJvb3RJZCB9KTtcclxuICB9O1xyXG5cclxuICBjb25zdCBnb0JyYW5jaCA9IGV2ID0+IHtcclxuICAgIGxldCBicmFuY2hJZCA9IG1zZy52YWx1ZS5jb250ZW50LmJyYW5jaCB8fCBtc2cua2V5O1xyXG4gICAgbmF2aWdhdGUoXCIvdGhyZWFkXCIsIHsgdGhyZWFkOiBicmFuY2hJZCB9KTtcclxuICB9O1xyXG48L3NjcmlwdD5cclxuXHJcbjxzdHlsZT5cclxuICBkaXYgaW1nLmlzLWltYWdlLWZyb20tYmxvYiB7XHJcbiAgICBtYXgtd2lkdGg6IDkwJTtcclxuICB9XHJcblxyXG4gIC5jYXJkLWJvZHkge1xyXG4gICAgb3ZlcmZsb3ctd3JhcDogYnJlYWstd29yZDtcclxuICB9XHJcbjwvc3R5bGU+XHJcblxyXG48ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XHJcbiAgeyNpZiBoYXNDb250ZW50V2FybmluZyAmJiBzaG93Q29udGVudFdhcm5pbmd9XHJcbiAgICA8cD57bXNnLnZhbHVlLmNvbnRlbnQuY29udGVudFdhcm5pbmd9PC9wPlxyXG4gICAgPGJ1dHRvblxyXG4gICAgICBjbGFzcz1cImJ0blwiXHJcbiAgICAgIG9uOmNsaWNrPXsoKSA9PiAoc2hvd0NvbnRlbnRXYXJuaW5nID0gIXNob3dDb250ZW50V2FybmluZyl9PlxyXG4gICAgICBTaG93IE1lc3NhZ2VcclxuICAgIDwvYnV0dG9uPlxyXG4gIHs6ZWxzZX1cclxuICAgIHsjaWYgaGFzQ29udGVudFdhcm5pbmd9XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJ0b2FzdCB0b2FzdC13YXJuaW5nXCI+XHJcbiAgICAgICAgPHA+XHJcbiAgICAgICAgICA8Yj5Db250ZW50IFdhcm5pbmc6PC9iPlxyXG4gICAgICAgICAge21zZy52YWx1ZS5jb250ZW50LmNvbnRlbnRXYXJuaW5nfVxyXG4gICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICBjbGFzcz1cImJ0biBidG4tc20gZmxvYXQtcmlnaHRcIlxyXG4gICAgICAgICAgICBvbjpjbGljaz17KCkgPT4gKHNob3dDb250ZW50V2FybmluZyA9ICFzaG93Q29udGVudFdhcm5pbmcpfT5cclxuICAgICAgICAgICAgSGlkZSBNZXNzYWdlXHJcbiAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICA8L3A+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgey9pZn1cclxuICAgIHtAaHRtbCBjb250ZW50fVxyXG4gIHsvaWZ9XHJcbjwvZGl2PlxyXG48ZGl2IGNsYXNzPVwiY2FyZC1mb290ZXJcIj5cclxuICA8ZGl2IGNsYXNzPVwiY29sdW1ucyBjb2wtZ2FwbGVzc1wiPlxyXG4gICAgPGRpdiBjbGFzcz1cImNvbHVtbiBjb2wtNlwiPlxyXG4gICAgICA8bGFiZWwgY2xhc3M9XCJmb3JtLXN3aXRjaCBkLWlubGluZVwiPlxyXG4gICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBvbjpjaGFuZ2U9e2xpa2VDaGFuZ2VkfSBjaGVja2VkPXtsaWtlZH0gLz5cclxuICAgICAgICA8aSBjbGFzcz1cImZvcm0taWNvblwiIC8+XHJcbiAgICAgICAgTGlrZVxyXG4gICAgICA8L2xhYmVsPlxyXG4gICAgICB7I2lmIG1zZy52YWx1ZS5jb250ZW50LnJvb3R9XHJcbiAgICAgICAgPHNwYW4+XHJcbiAgICAgICAgICA8YVxyXG4gICAgICAgICAgICBocmVmPVwiP3RocmVhZD17ZW5jb2RlVVJJQ29tcG9uZW50KG1zZy52YWx1ZS5jb250ZW50LnJvb3QpfSMvdGhyZWFkXCJcclxuICAgICAgICAgICAgb246Y2xpY2t8cHJldmVudERlZmF1bHQ9e2dvUm9vdH0+XHJcbiAgICAgICAgICAgIChyb290KVxyXG4gICAgICAgICAgPC9hPlxyXG4gICAgICAgIDwvc3Bhbj5cclxuICAgICAgey9pZn1cclxuICAgICAgeyNpZiBtc2cudmFsdWUuY29udGVudC5icmFuY2h9XHJcbiAgICAgICAgPHNwYW4+XHJcbiAgICAgICAgICA8YVxyXG4gICAgICAgICAgICBocmVmPVwiP3RocmVhZD17ZW5jb2RlVVJJQ29tcG9uZW50KG1zZy52YWx1ZS5jb250ZW50LmJyYW5jaCl9Iy90aHJlYWRcIlxyXG4gICAgICAgICAgICBvbjpjbGlja3xwcmV2ZW50RGVmYXVsdD17Z29CcmFuY2h9PlxyXG4gICAgICAgICAgICAoaW4gcmVwbHkgdG8pXHJcbiAgICAgICAgICA8L2E+XHJcbiAgICAgICAgPC9zcGFuPlxyXG4gICAgICB7L2lmfVxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgeyNpZiAhbXNnLnZhbHVlLnByaXZhdGV9XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW4gY29sLTYgdGV4dC1yaWdodFwiPlxyXG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG5cIiBvbjpjbGljaz17Zm9ya30+Rm9yazwvYnV0dG9uPlxyXG5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuXCIgb246Y2xpY2s9e3JlcGx5fT5SZXBseTwvYnV0dG9uPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIHsvaWZ9XHJcbiAgPC9kaXY+XHJcblxyXG48L2Rpdj5cclxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQXVFRSxVQUFVLGVBQUMsQ0FBQyxBQUNWLGFBQWEsQ0FBRSxVQUFVLEFBQzNCLENBQUMifQ== */";
	append(document.head, style);
}

// (85:2) {:else}
function create_else_block(ctx) {
	var t, html_tag;

	var if_block = (ctx.hasContentWarning) && create_if_block_4(ctx);

	return {
		c: function create() {
			if (if_block) if_block.c();
			t = space();
			html_tag = new HtmlTag(ctx.content, null);
		},

		m: function mount(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert(target, t, anchor);
			html_tag.m(target, anchor);
		},

		p: function update(changed, ctx) {
			if (ctx.hasContentWarning) {
				if (if_block) {
					if_block.p(changed, ctx);
				} else {
					if_block = create_if_block_4(ctx);
					if_block.c();
					if_block.m(t.parentNode, t);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},

		d: function destroy(detaching) {
			if (if_block) if_block.d(detaching);

			if (detaching) {
				detach(t);
				html_tag.d();
			}
		}
	};
}

// (78:2) {#if hasContentWarning && showContentWarning}
function create_if_block_3(ctx) {
	var p, t0_value = ctx.msg.value.content.contentWarning, t0, t1, button, dispose;

	return {
		c: function create() {
			p = element("p");
			t0 = text(t0_value);
			t1 = space();
			button = element("button");
			button.textContent = "Show Message";
			add_location(p, file, 78, 4, 2074);
			attr(button, "class", "btn");
			add_location(button, file, 79, 4, 2121);
			dispose = listen(button, "click", ctx.click_handler);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, t0);
			insert(target, t1, anchor);
			insert(target, button, anchor);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && t0_value !== (t0_value = ctx.msg.value.content.contentWarning)) {
				set_data(t0, t0_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
				detach(t1);
				detach(button);
			}

			dispose();
		}
	};
}

// (86:4) {#if hasContentWarning}
function create_if_block_4(ctx) {
	var div, p, b, t1, t2_value = ctx.msg.value.content.contentWarning, t2, t3, button, dispose;

	return {
		c: function create() {
			div = element("div");
			p = element("p");
			b = element("b");
			b.textContent = "Content Warning:";
			t1 = space();
			t2 = text(t2_value);
			t3 = space();
			button = element("button");
			button.textContent = "Hide Message";
			add_location(b, file, 88, 10, 2356);
			attr(button, "class", "btn btn-sm float-right");
			add_location(button, file, 90, 10, 2437);
			add_location(p, file, 87, 8, 2341);
			attr(div, "class", "toast toast-warning");
			add_location(div, file, 86, 6, 2298);
			dispose = listen(button, "click", ctx.click_handler_1);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, p);
			append(p, b);
			append(p, t1);
			append(p, t2);
			append(p, t3);
			append(p, button);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && t2_value !== (t2_value = ctx.msg.value.content.contentWarning)) {
				set_data(t2, t2_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			dispose();
		}
	};
}

// (110:6) {#if msg.value.content.root}
function create_if_block_2(ctx) {
	var span, a, t, a_href_value, dispose;

	return {
		c: function create() {
			span = element("span");
			a = element("a");
			t = text("(root)");
			attr(a, "href", a_href_value = "?thread=" + encodeURIComponent(ctx.msg.value.content.root) + "#/thread");
			add_location(a, file, 111, 10, 3028);
			add_location(span, file, 110, 8, 3010);
			dispose = listen(a, "click", prevent_default(ctx.goRoot));
		},

		m: function mount(target, anchor) {
			insert(target, span, anchor);
			append(span, a);
			append(a, t);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && a_href_value !== (a_href_value = "?thread=" + encodeURIComponent(ctx.msg.value.content.root) + "#/thread")) {
				attr(a, "href", a_href_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(span);
			}

			dispose();
		}
	};
}

// (119:6) {#if msg.value.content.branch}
function create_if_block_1(ctx) {
	var span, a, t, a_href_value, dispose;

	return {
		c: function create() {
			span = element("span");
			a = element("a");
			t = text("(in reply to)");
			attr(a, "href", a_href_value = "?thread=" + encodeURIComponent(ctx.msg.value.content.branch) + "#/thread");
			add_location(a, file, 120, 10, 3290);
			add_location(span, file, 119, 8, 3272);
			dispose = listen(a, "click", prevent_default(ctx.goBranch));
		},

		m: function mount(target, anchor) {
			insert(target, span, anchor);
			append(span, a);
			append(a, t);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && a_href_value !== (a_href_value = "?thread=" + encodeURIComponent(ctx.msg.value.content.branch) + "#/thread")) {
				attr(a, "href", a_href_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(span);
			}

			dispose();
		}
	};
}

// (130:4) {#if !msg.value.private}
function create_if_block(ctx) {
	var div, button0, t_1, button1, dispose;

	return {
		c: function create() {
			div = element("div");
			button0 = element("button");
			button0.textContent = "Fork";
			t_1 = space();
			button1 = element("button");
			button1.textContent = "Reply";
			attr(button0, "class", "btn");
			add_location(button0, file, 131, 8, 3596);
			attr(button1, "class", "btn");
			add_location(button1, file, 133, 8, 3657);
			attr(div, "class", "column col-6 text-right");
			add_location(div, file, 130, 6, 3549);

			dispose = [
				listen(button0, "click", ctx.fork),
				listen(button1, "click", ctx.reply)
			];
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, button0);
			append(div, t_1);
			append(div, button1);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	var div0, t0, div3, div2, div1, label, input, t1, i, t2, t3, t4, t5, dispose;

	function select_block_type(ctx) {
		if (ctx.hasContentWarning && ctx.showContentWarning) return create_if_block_3;
		return create_else_block;
	}

	var current_block_type = select_block_type(ctx);
	var if_block0 = current_block_type(ctx);

	var if_block1 = (ctx.msg.value.content.root) && create_if_block_2(ctx);

	var if_block2 = (ctx.msg.value.content.branch) && create_if_block_1(ctx);

	var if_block3 = (!ctx.msg.value.private) && create_if_block(ctx);

	return {
		c: function create() {
			div0 = element("div");
			if_block0.c();
			t0 = space();
			div3 = element("div");
			div2 = element("div");
			div1 = element("div");
			label = element("label");
			input = element("input");
			t1 = space();
			i = element("i");
			t2 = text("\r\n        Like");
			t3 = space();
			if (if_block1) if_block1.c();
			t4 = space();
			if (if_block2) if_block2.c();
			t5 = space();
			if (if_block3) if_block3.c();
			attr(div0, "class", "card-body svelte-1ftdgav");
			add_location(div0, file, 76, 0, 1996);
			attr(input, "type", "checkbox");
			input.checked = ctx.liked;
			add_location(input, file, 105, 8, 2836);
			attr(i, "class", "form-icon");
			add_location(i, file, 106, 8, 2911);
			attr(label, "class", "form-switch d-inline");
			add_location(label, file, 104, 6, 2790);
			attr(div1, "class", "column col-6");
			add_location(div1, file, 103, 4, 2756);
			attr(div2, "class", "columns col-gapless");
			add_location(div2, file, 102, 2, 2717);
			attr(div3, "class", "card-footer");
			add_location(div3, file, 101, 0, 2688);
			dispose = listen(input, "change", ctx.likeChanged);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div0, anchor);
			if_block0.m(div0, null);
			insert(target, t0, anchor);
			insert(target, div3, anchor);
			append(div3, div2);
			append(div2, div1);
			append(div1, label);
			append(label, input);
			append(label, t1);
			append(label, i);
			append(label, t2);
			append(div1, t3);
			if (if_block1) if_block1.m(div1, null);
			append(div1, t4);
			if (if_block2) if_block2.m(div1, null);
			append(div2, t5);
			if (if_block3) if_block3.m(div2, null);
		},

		p: function update(changed, ctx) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
				if_block0.p(changed, ctx);
			} else {
				if_block0.d(1);
				if_block0 = current_block_type(ctx);
				if (if_block0) {
					if_block0.c();
					if_block0.m(div0, null);
				}
			}

			if (changed.liked) {
				input.checked = ctx.liked;
			}

			if (ctx.msg.value.content.root) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_2(ctx);
					if_block1.c();
					if_block1.m(div1, t4);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (ctx.msg.value.content.branch) {
				if (if_block2) {
					if_block2.p(changed, ctx);
				} else {
					if_block2 = create_if_block_1(ctx);
					if_block2.c();
					if_block2.m(div1, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (!ctx.msg.value.private) {
				if (!if_block3) {
					if_block3 = create_if_block(ctx);
					if_block3.c();
					if_block3.m(div2, null);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div0);
			}

			if_block0.d();

			if (detaching) {
				detach(t0);
				detach(div3);
			}

			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			dispose();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { navigate } = require("../utils.js");
  const { getPref } = require("../prefs.js")

  let { msg } = $$props;
  let contentWarningsExpandByDefault = getPref("content-warnings-expand", "collapsed")
  let content = ssb.markdown(msg.value.content.text);
  let liked = false;
  let hasContentWarning = msg.value.content.contentWarning || false;
  let showContentWarning = contentWarningsExpandByDefault === "collapsed";

  ssb.votes(msg.key).then(ms => {
    ms.forEach(m => {
      let author = m.value.author;
      if (author === ssb.feed && m.value.content.vote.value === 1) {
        $$invalidate('liked', liked = true);
      }
    });
  });

  const likeChanged = ev => {
    let v = ev.target.checked;
    if (v) {
      ssb
        .like(msg.key)
        .then(() => console.log("liked", msg.key))
        .catch(() => { const $$result = (liked = false); $$invalidate('liked', liked); return $$result; });
    } else {
      ssb
        .unlike(msg.key)
        .then(() => console.log("unliked", msg.key))
        .catch(() => { const $$result = (liked = true); $$invalidate('liked', liked); return $$result; });
    }
  };

  const reply = ev => {
    let root = msg.value.content.root || msg.key;
    let channel = msg.value.content.channel;
    let replyfeed = msg.value.author;
    navigate("/compose", { root, branch: msg.key, channel, replyfeed });
  };

  const fork = ev => {
    let originalRoot = msg.value.content.root || msg.key;
    let channel = msg.value.content.channel;
    let replyfeed = msg.value.author;
    navigate("/compose", {
      root: msg.key,
      branch: msg.key,
      fork: originalRoot,
      channel,
      replyfeed
    });
  };

  const goRoot = ev => {
    let rootId = msg.value.content.root || msg.key;
    navigate("/thread", { thread: rootId });
  };

  const goBranch = ev => {
    let branchId = msg.value.content.branch || msg.key;
    navigate("/thread", { thread: branchId });
  };

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1.warn(`<PostMsg> was created with unknown prop '${key}'`);
	});

	function click_handler() {
		const $$result = (showContentWarning = !showContentWarning);
		$$invalidate('showContentWarning', showContentWarning);
		return $$result;
	}

	function click_handler_1() {
		const $$result = (showContentWarning = !showContentWarning);
		$$invalidate('showContentWarning', showContentWarning);
		return $$result;
	}

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return {
		msg,
		content,
		liked,
		hasContentWarning,
		showContentWarning,
		likeChanged,
		reply,
		fork,
		goRoot,
		goBranch,
		click_handler,
		click_handler_1
	};
}

class PostMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-1ftdgav-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console_1.warn("<PostMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<PostMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<PostMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = PostMsg;

},{"../prefs.js":28,"../utils.js":30,"svelte/internal":8}],23:[function(require,module,exports){
/* PrivateMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	noop,
	safe_not_equal
} = require("svelte/internal");

const file = "PrivateMsg.svelte";

function create_fragment(ctx) {
	var div, p;

	return {
		c: function create() {
			div = element("div");
			p = element("p");
			p.textContent = "🔒 PRIVATE";
			add_location(p, file, 5, 0, 67);
			attr(div, "class", "card-body");
			add_location(div, file, 4, 0, 42);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, p);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { msg } = $$props;

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<PrivateMsg> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return { msg };
}

class PrivateMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console.warn("<PrivateMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<PrivateMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<PrivateMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = PrivateMsg;

},{"svelte/internal":8}],24:[function(require,module,exports){
/* PubMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	safe_not_equal,
	set_data,
	text
} = require("svelte/internal");

const file = "PubMsg.svelte";

function create_fragment(ctx) {
	var div, t0, t1, a, t2, t3, t4, a_href_value, dispose;

	return {
		c: function create() {
			div = element("div");
			t0 = text(ctx.person);
			t1 = text(" announced pub\r\n  ");
			a = element("a");
			t2 = text(ctx.host);
			t3 = text(":");
			t4 = text(ctx.port);
			attr(a, "href", a_href_value = "/index.html?feed=" + ctx.encodedid + "#/profile");
			add_location(a, file, 22, 2, 574);
			attr(div, "class", "card-body");
			add_location(div, file, 20, 0, 520);
			dispose = listen(a, "click", ctx.goProfile);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
			append(div, a);
			append(a, t2);
			append(a, t3);
			append(a, t4);
		},

		p: function update(changed, ctx) {
			if (changed.person) {
				set_data(t0, ctx.person);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			dispose();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { navigate } = require("../utils.js");

  let { msg } = $$props;

  let encodedid = encodeURIComponent(msg.value.content.address.key);
  let person = msg.value.author;
  let host = msg.value.content.address.host
  let port = msg.value.content.address.port

  ssb.avatar(msg.value.author).then(data => { const $$result = (person = data.name); $$invalidate('person', person); return $$result; });

  
  const goProfile = ev => {
    ev.stopPropagation();
    ev.preventDefault();
    navigate("/profile", { feed: msg.value.content.address.key });
  };

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<PubMsg> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return {
		msg,
		encodedid,
		person,
		host,
		port,
		goProfile
	};
}

class PubMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console.warn("<PubMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<PubMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<PubMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = PubMsg;

},{"../utils.js":30,"svelte/internal":8}],25:[function(require,module,exports){
/* VoteMsg.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");

const file = "VoteMsg.svelte";

function create_fragment(ctx) {
	var div, t0, t1, t2, t3, a, t4, a_href_value, dispose;

	return {
		c: function create() {
			div = element("div");
			t0 = text(ctx.person);
			t1 = space();
			t2 = text(ctx.expression);
			t3 = space();
			a = element("a");
			t4 = text(ctx.label);
			attr(a, "href", a_href_value = "/index.html?thread=" + ctx.encodedid + "#/thread");
			add_location(a, file, 29, 2, 752);
			attr(div, "class", "card-body");
			add_location(div, file, 27, 0, 699);
			dispose = listen(a, "click", ctx.goThread);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
			append(div, t2);
			append(div, t3);
			append(div, a);
			append(a, t4);
		},

		p: function update(changed, ctx) {
			if (changed.person) {
				set_data(t0, ctx.person);
			}

			if (changed.label) {
				set_data(t4, ctx.label);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			dispose();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { navigate } = require("../utils.js");
  let { msg } = $$props;

  let expression = msg.value.content.vote.expression || "liked";
  let msgid = msg.value.content.vote.link;
  let encodedid = encodeURIComponent(msgid);
  let label = msgid;
  let person = msg.value.author;

  ssb.blurbFromMsg(msgid, 100).then(blurb => {
    $$invalidate('label', label = blurb);
  });

  ssb.avatar(msg.value.author).then(data => { const $$result = (person = data.name); $$invalidate('person', person); return $$result; });

  const goThread = ev => {
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.ctrlKey) {
      window.open(`?thread=${encodeURIComponent(msgid)}#/thread`);
    } else {
      navigate("/thread", { thread: msgid });
    }
  };

	const writable_props = ['msg'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<VoteMsg> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
	};

	return {
		msg,
		expression,
		encodedid,
		label,
		person,
		goThread
	};
}

class VoteMsg extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, ["msg"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.msg === undefined && !('msg' in props)) {
			console.warn("<VoteMsg> was created without expected prop 'msg'");
		}
	}

	get msg() {
		throw new Error("<VoteMsg>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set msg(value) {
		throw new Error("<VoteMsg>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = VoteMsg;

},{"../utils.js":30,"svelte/internal":8}],26:[function(require,module,exports){
/* AvatarChip.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	empty,
	init,
	insert,
	listen,
	noop,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");

const file = "AvatarChip.svelte";

// (29:0) {:else}
function create_else_block(ctx) {
	var span, t, dispose;

	return {
		c: function create() {
			span = element("span");
			t = text(ctx.name);
			attr(span, "class", "chip");
			add_location(span, file, 29, 2, 600);
			dispose = listen(span, "click", ctx.avatarClick);
		},

		m: function mount(target, anchor) {
			insert(target, span, anchor);
			append(span, t);
		},

		p: function update(changed, ctx) {
			if (changed.name) {
				set_data(t, ctx.name);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(span);
			}

			dispose();
		}
	};
}

// (24:0) {#if image}
function create_if_block(ctx) {
	var div, img, t0, t1, dispose;

	return {
		c: function create() {
			div = element("div");
			img = element("img");
			t0 = space();
			t1 = text(ctx.name);
			attr(img, "src", ctx.image);
			attr(img, "class", "avatar avatar-sm");
			add_location(img, file, 25, 4, 520);
			attr(div, "class", "chip");
			add_location(div, file, 24, 2, 473);
			dispose = listen(div, "click", ctx.avatarClick);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, img);
			append(div, t0);
			append(div, t1);
		},

		p: function update(changed, ctx) {
			if (changed.image) {
				attr(img, "src", ctx.image);
			}

			if (changed.name) {
				set_data(t1, ctx.name);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			dispose();
		}
	};
}

function create_fragment(ctx) {
	var if_block_anchor;

	function select_block_type(ctx) {
		if (ctx.image) return create_if_block;
		return create_else_block;
	}

	var current_block_type = select_block_type(ctx);
	var if_block = current_block_type(ctx);

	return {
		c: function create() {
			if_block.c();
			if_block_anchor = empty();
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
		},

		p: function update(changed, ctx) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(changed, ctx);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);
				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if_block.d(detaching);

			if (detaching) {
				detach(if_block_anchor);
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { createEventDispatcher } = require("svelte");
  let { feed } = $$props;

  let image = false;
  let name = feed;
  const dispatch = createEventDispatcher();

  ssb.avatar(feed).then(data => {
    if (data.image !== null) {
      $$invalidate('image', image = `http://localhost:8989/blobs/get/${data.image}`);
    }
    $$invalidate('name', name = data.name);
  });

  function avatarClick() {
    dispatch("avatarClick", {
      feed,
      name
    });
  }

	const writable_props = ['feed'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<AvatarChip> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('feed' in $$props) $$invalidate('feed', feed = $$props.feed);
	};

	return { feed, image, name, avatarClick };
}

class AvatarChip extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, ["feed"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.feed === undefined && !('feed' in props)) {
			console.warn("<AvatarChip> was created without expected prop 'feed'");
		}
	}

	get feed() {
		throw new Error("<AvatarChip>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set feed(value) {
		throw new Error("<AvatarChip>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = AvatarChip;

},{"svelte":7,"svelte/internal":8}],27:[function(require,module,exports){
const timeago = require("timeago-simple")

const timestamp = t => {

    return timeago.simple(new Date(t))
}

module.exports = {timestamp}
},{"timeago-simple":11}],28:[function(require,module,exports){
let savedData = {}

const loadConfiguration = async () => {
    console.log("Loading configuration...")
    try {
        let data = await browser.storage.local.get()

        if (data.hasOwnProperty("keys")) {
            savedData = data
        } else {
            throw "Configuration is missing"
        }
    } catch (n) {
        throw "Configuration is missing"
    }
}

const getPref = (key, defaultValue) => {
    if (savedData.preferences) {
        if (savedData.preferences.hasOwnProperty(key)) {
            return savedData.preferences[key]
        }
    }
    return defaultValue
}


const setConnectionConfiguration = ({ keys, remote, manifest }) => {
    savedData.keys = keys
    savedData.remote = remote
    savedData.manifest = manifest

    browser.storage.local.set(savedData)

}

const setPref = (key, value) => {
    savedData.preferences = savedData.preferences || {}
    savedData.preferences[key] = value

    browser.storage.local.set(savedData)
}

const savedKeys = () => {
    return savedData.keys
}

module.exports = {
    loadConfiguration,
    setPref,
    getPref,
    setConnectionConfiguration,
    savedKeys
}
},{}],29:[function(require,module,exports){
/**
 * SSB
 *
 * TL;DR: SSB API for Patchfox using Hermiebox.
 *
 * OBJECTIVE:
 * The SSB is in flux right now. There are many approaches being played with which might
 * affect how this WebExtension connect to sbot. Some of the experiments being tried out are:
 *
 * - lessbot/nobot: each app maintain its own database and index but post through a shared sbot.
 * - graphql: export a GraphQL server which offers SSB features.
 * - json-rpc: export a JSON-RPC server offering SSB features.
 *
 * This driver folder will contain the various adapters to use these modes of connection as they
 * become available. For now, we'll use hermiebox.
 *
 * **Important: Each driver should export the exact same API to Patchfox**. This way we can
 * switch drivers without having to refactor the add-on.
 *
 * HOW IT WORKS:
 * Hermiebox is a browserified fat package of common NodeJS modules from our community and also
 * few highlevel API methods for common tasks. It uses WebSockets to connect to a running sbot
 * using muxrpc and shs stuff, so it needs your `secret` to be available.
 * 
 * ATTENTION:
 * This is a legacy from when Patchfox was vanilla JS. I'm gonna need to refactor this a lot
 * 
 * TODO: Refactor to use `ssb-query`
 */


const { getPref } = require("./prefs.js")
const { isMessageHidden } = require("./abusePrevention.js")

const pull = hermiebox.modules.pullStream
const sort = hermiebox.modules.ssbSort

let sbot = false

let avatarCache = {}
let msgCache = {}

class SSB {

    log(pMsg, pVal = "") {
        console.log(`[SSB API] - ${pMsg}`, pVal)
    }

    async connect(pKeys) {
        var server = await hermiebox.api.connect(pKeys)
        this.log("you are", server.id)
        this.feed = server.id
        sbot = server
    }

    filterLimit() {
        let limit = getPref("limit", 10)
        return pull.take(limit)
    }

    filterWithUserFilters() {
        return pull.filter(m => isMessageHidden(m))
    }

    filterTypes() {
        let knownMessageTypes = {
            "post": "showTypePost",
            "about": "showTypeAbout",
            "vote": "showTypeVote",
            "contact": "showTypeContact",
            "pub": "showTypePub",
            "blog": "showTypeBlog",
            "channel": "showTypeChannel"
        }

        let showUnknown = false

        if (showUnknown) {
            return pull.filter(() => true);
        }

        return pull.filter(msg => {
            let type = msg.value.content.type

            if (typeof type == "string" && knownMessageTypes[type]) {
                return getPref(knownMessageTypes[type], true)
            }
            return getPref("showTypeUnknown", false)
        })
    }



    public(opts) {
        return new Promise((resolve, reject) => {

            opts = opts || {}
            opts.reverse = opts.reverse || true

            console.log("opts", opts)

            pull(
                sbot.createFeedStream(opts),
                pull.filter(msg => msg && msg.value && msg.value.content),
                this.filterTypes(),
                this.filterWithUserFilters(),
                this.filterLimit(),
                pull.collect((err, msgs) => {
                    console.log("msgs", msgs)
                    if (err) {
                        reject(err)
                    }

                    resolve(msgs)
                })
            )
        })
    }

    thread(id) {
        return new Promise((resolve, reject) => {
            sbot.get(id, (err, value) => {
                if (err) return cb(err)
                var rootMsg = { key: id, value: value }
                pull(
                    sbot.backlinks && sbot.backlinks.read ? sbot.backlinks.read({
                        query: [
                            {
                                $filter: {
                                    dest: id,
                                    value: {
                                        content: {

                                            root: id
                                        }
                                    }
                                }
                            }
                        ]
                    }) : pull(
                        sbot.links({ dest: id, values: true, rel: 'root' }),
                        pull.filter(function (msg) {
                            var c = msg && msg.value && msg.value.content
                            return c && c.type === 'post' && c.root === id
                        }),
                        pull.unique('key')
                    ),
                    this.filterTypes(),
                    this.filterWithUserFilters(),
                    this.filterLimit(),
                    pull.collect((err, msgs) => {
                        if (err) reject(err)
                        resolve(sort([rootMsg].concat(msgs)))
                    })
                )
            })
        })
    }

    mentions(feed, lt) {
        return new Promise((resolve, reject) => {
            const createBacklinkStream = id => {
                var filterQuery = {
                    $filter: {
                        dest: id
                    }
                };

                if (lt) {
                    filterQuery.$filter.value = { timestamp: { $lt: lt } };
                }

                return sbot.backlinks.read({
                    query: [filterQuery],
                    index: "DTA", // use asserted timestamps
                    reverse: true,
                });
            };

            const uniqueRoots = msg => {
                return pull.filter(msg => {
                    let msgKey = msg.key;
                    if (msg.value.content.type !== "post") {
                        return true;
                    }
                    let rootKey = msg.value.content.root || false;
                    if (rootKey) {
                        if (msgs.some(m => m.value.content.root === rootKey)) {
                            return false;
                        }
                    }
                    return true;
                });
            };

            const mentionUser = msg => {
                return pull.filter(msg => {
                    if (msg.value.content.type !== "post") {
                        return true;
                    }
                    let mentions = msg.value.content.mentions || [];
                    if (mentions.some(m => m.link == sbot.id)) {
                        return true;
                    }
                    return false;
                });
            };

            pull(
                createBacklinkStream(sbot.id),
                this.filterTypes(),
                this.filterWithUserFilters(),
                this.filterLimit(),
                pull.collect((err, msgs) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msgs)
                    }
                })
            );
        })
    }

    search(query, lt) {
        return new Promise((resolve, reject) => {
            let q = query.toLowerCase();
            pull(
                pull(sbot => sbot.search.query({ q, limit: 500 })),
                this.filterTypes(),
                this.filterWithUserFilters(),
                this.filterLimit(),
                pull.collect((err, msgs) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msgs)
                    }
                })
            );
        })
    }

    searchWithCallback(query, cb) {
        const matchesQuery = searchFilter(query.split(" "))
        const opts = { reverse: true,  live: true, private: true }

        function searchFilter(terms) {
            return function (msg) {
                if (msg.sync) return true
                const c = msg && msg.value && msg.value.content
                return c && (
                    msg.key === terms[0] || andSearch(terms.map(function (term) {
                        return new RegExp('\\b' + term + '\\b', 'i')
                    }), [c.text, c.name, c.title])
                )
            }
        }

        function andSearch(terms, inputs) {
            for (let i = 0; i < terms.length; i++) {
                let match = false
                for (let j = 0; j < inputs.length; j++) {
                    if (terms[i].test(inputs[j])) match = true
                }
                // if a term was not matched by anything, filter this one
                if (!match) return false
            }
            return true
        }

        return new Promise((resolve, reject) => {
            if (sbot) {
                try {
                    let q = query.toLowerCase();
                    pull(
                        sbot.createLogStream(opts),
                        pull.filter(matchesQuery),
                        this.filterTypes(),
                        this.filterWithUserFilters(),
                        this.filterLimit(),
                        pull.drain((msg) => {
                            if (!msg.sync) {
                                cb(msg)
                            }
                        }, () => resolve())
                    );
                } catch (e) {
                    reject(e)
                }
            } else {
                reject("no sbot")
            }
        })
    }

    async profile(feedid) {
        try {
            var user = await hermiebox.api.profile(feedid)
            return user

        } catch (n) {
            console.error(n)
            return false
        }
    }

    async get(msgid) {
        var msg = await hermiebox.api.get(msgid)
        return msg
    }

    async setAvatarCache(feed, data) {
        let s = {}
        s[`avatar-${feed}`] = data
        return browser.storage.local.set(s)
    }

    async getCachedAvatar(feed) {
        return browser.storage.local.get(`avatar-${feed}`)
    }

    async avatar(feed) {
        const getAvatarAux = async feed => {
            let avatar = await hermiebox.api.avatar(feed)
            // await this.setAvatarCache(feed, avatar)
            avatarCache[feed] = avatar
            localStorage.setItem(`profile-${feed}`, JSON.stringify(avatar))
            return avatar
        }

        if (avatarCache[feed]) {
            setTimeout(() => getAvatarAux(feed), 300) // update cache...
            return avatarCache[feed]
        }
        try {
            return getAvatarAux(feed)
        } catch (n) {
            throw n
        }

    }

    async loadCaches() {
        console.time("avatar cache")
        let allSavedData = { ...localStorage }
        delete allSavedData["/.ssb/secret"]
        let keys = Object.keys(allSavedData)
        keys.forEach(k => {
            let key = k.replace("profile-", "")
            avatarCache[key] = JSON.parse(allSavedData[k])
        })

        console.timeEnd("avatar cache")
        console.log(`cached ${Object.keys(avatarCache).length} users`)

    }

    async blurbFromMsg(msgid, howManyChars) {
        let retVal = msgid

        try {
            if (msgCache[msgid]) {
                return msgCache[msgid]
            }
            let data = await ssb.get(msgid)

            if (data.content.type == "post") {
                retVal = this.plainTextFromMarkdown(data.content.text.slice(0, howManyChars) + "...")
            }
            msgCache[msgid] = retVal
            return retVal
        } catch (n) {
            return retVal
        }
    }
    plainTextFromMarkdown(text) {
        // TODO: this doesn't belong here
        let html = this.markdown(text)
        let div = document.createElement("div")
        div.innerHTML = html
        return div.innerText
    }

    markdown(text) {

        function replaceMsgID(match, id, offset, string) {
            let eid = encodeURIComponent(`%${id}`);

            return `<a class="thread-link" href="?thread=${eid}#/thread`;
        }

        function replaceChannel(match, id, offset, string) {
            let eid = encodeURIComponent(id);

            return `<a class="channel-link" href="?channel=${eid}#/channel`;
        }


        function replaceFeedID(match, id, offset, string) {
            let eid = encodeURIComponent(`@${id}`);
            return "<a class=\"profile-link\" href=\"?feed=" + eid + "#/profile";
        }


        function replaceImageLinks(match, id, offset, string) {
            return "<a class=\"image-link\" target=\"_blank\" href=\"http://localhost:8989/blobs/get/&" + encodeURIComponent(id);
        }


        function replaceImages(match, id, offset, string) {
            return "<img class=\"is-image-from-blob\" src=\"http://localhost:8989/blobs/get/&" + encodeURIComponent(id);
        }

        let html = hermiebox.modules.ssbMarkdown.block(text)
        html = html
            .replace(/<pre>/gi, "<pre class=\"code\">")
            .replace(/<a href="#([^"]*)/gi, replaceChannel)
            .replace(/<a href="@([^"]*)/gi, replaceFeedID)
            .replace(/target="_blank"/gi, "")
            .replace(/<a href="%([^"]*)/gi, replaceMsgID)
            .replace(/<img src="&([^"]*)/gi, replaceImages)
            .replace(/<a href="&([^"]*)/gi, replaceImageLinks)

        return html
    }

    ref() {
        return hermiebox.modules.ssbRef
    }

    getTimestamp(msg) {
        const arrivalTimestamp = msg.timestamp;
        const declaredTimestamp = msg.value.timestamp;
        return Math.min(arrivalTimestamp, declaredTimestamp);
    }

    getRootMsgId(msg) {
        if (msg && msg.value && msg.value.content) {
            const root = msg.value.content.root;
            if (hermiebox.modules.ssbRef.isMsgId(root)) {
                return root;
            }
        }
    }

    newPost(data) {
        return new Promise((resolve, reject) => {
            let msgToPost = { type: "post", text: data.text }

            const commonFields = [
                "root",
                "branch",
                "channel",
                "fork",
                "contentWarning"
            ]

            commonFields.forEach(f => {
                if (typeof data[f] !== "undefined") {
                    msgToPost[f] = data[f]
                }
            })

            msgToPost.mentions = hermiebox.modules.ssbMentions(msgToPost.text) || []
            msgToPost.mentions = msgToPost.mentions.filter(n => n) // prevent null elements...

            const sbot = hermiebox.sbot || false

            console.log("post", msgToPost)

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            } else {
                reject("There is no sbot connection")
            }
        })
    }

    newBlogPost(data) {
        return new Promise((resolve, reject) => {
            let msgToPost = { type: "blog" }
            let blogContent = data.content

            const commonFields = [
                "channel",
                "contentWarning",
                "thumbnail",
                "title",
                "summary"
            ]

            commonFields.forEach(f => {
                if (typeof data[f] !== "undefined" && data[f].length > 0) {
                    msgToPost[f] = data[f]
                }
            })

            const sbot = hermiebox.sbot || false

            if (sbot) {
                pull(
                    pull.values([blogContent]),
                    sbot.blobs.add(function (err, hash) {
                        // 'hash' is the hash-id of the blob
                        if (err) {
                            reject("could not create blog post blob: " + err)
                        } else {
                            msgToPost.blog = hash;

                            console.log("blog post", msgToPost)

                            sbot.publish(msgToPost, function (err, msg) {
                                if (err) {
                                    reject(err)
                                } else {
                                    resolve(msg)
                                }
                            })
                        }
                    })
                );


            } else {
                reject("There is no sbot connection")
            }
        })
    }

    follow(userId) {
        return new Promise((resolve, reject) => {
            const sbot = hermiebox.sbot || false

            if (sbot) {
                sbot.publish({
                    type: "contact",
                    contact: userId,
                    following: true
                }, (err, msg) => {
                    // 'msg' includes the hash-id and headers
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }


    getBlob(blobid) {
        return hermiebox.api.getBlob(blobid)
    }

    votes(msgid) {
        return new Promise((resolve, reject) => {
            let pull = hermiebox.modules.pullStream
            let sbot = hermiebox.sbot

            if (sbot) {
                pull(
                    sbot.links({ dest: msgid, rel: "vote", values: true }),
                    pull.collect((err, msgs) => {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(msgs)
                        }
                    })
                )
            }
        })
    }

    like(msgid) {
        return new Promise((resolve, reject) => {

            const sbot = hermiebox.sbot || false

            const msgToPost = {
                "type": "vote",
                "vote": {
                    "link": msgid,
                    "value": 1,
                    "expression": "Like"
                }
            }

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }

    unlike(msgid) {
        return new Promise((resolve, reject) => {
            const sbot = hermiebox.sbot || false

            const msgToPost = {
                "type": "vote",
                "vote": {
                    "link": msgid,
                    "value": 0,
                    "expression": "Unlike"
                }
            }

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }

    channels() {
        return new Promise((resolve, reject) => {
            let pull = hermiebox.modules.pullStream
            let sbot = hermiebox.sbot || false

            if (sbot) {
                console.log("querying channels")
                pull(
                    sbot.query.read({
                        query: [
                            { "$filter": { "value": { "content": { "channel": { "$is": "string" }, "type": "post" } } } },
                            {
                                "$reduce": {
                                    "channel": ["value", "content", "channel"],
                                    "count": { "$count": true },
                                    "timestamp": { "$max": ["value", "timestamp"] }
                                }
                            },
                            { "$sort": [["timestamp"], ["count"]] }
                        ],
                        limit: 20
                    }),
                    pull.collect(function (err, data) {
                        console.log("channels", data)
                        if (err) {
                            reject(err)
                        } else {
                            resolve(data)
                        }
                    })
                )
            } else {
                reject("no sbot")
            }
        })
    }

    channel(channel, opts) {
        return new Promise((resolve, reject) => {
            let pull = hermiebox.modules.pullStream
            let sbot = hermiebox.sbot || false
            let query = {
                "$filter": {
                    value: {
                        content: { channel }
                    }
                },
                "$sort": [["value", "timestamp"]]

            }

            if (opts.lt) {
                query.$filter.value.timestamp = { $lt: opts.lt }
            }

            if (sbot) {
                pull(
                    sbot.query.read({
                        query: [
                            query
                        ],
                        reverse: true
                    }),
                    this.filterTypes(),
                    this.filterWithUserFilters(),
                    this.filterLimit(),
                    pull.collect(function (err, data) {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(data)
                        }
                    })
                )
            } else {
                reject("no sbot")
            }
        })
    }

    channelSubscribe(channel) {
        return new Promise((resolve, reject) => {
            const sbot = hermiebox.sbot || false

            const msgToPost = {
                "type": "channel",
                "channel": channel,
                "subscribed": true
            }

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }

    channelUnsubscribe(channel) {
        return new Promise((resolve, reject) => {
            const sbot = hermiebox.sbot || false

            const msgToPost = {
                "type": "channel",
                "channel": channel,
                "subscribed": false
            }

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }

    channelSubscribed(channel, feed) {
        return new Promise((resolve, reject) => {
            let pull = hermiebox.modules.pullStream
            let sbot = hermiebox.sbot || false

            if (sbot) {
                if (!feed) {
                    feed = sbot.id
                }

                let query = {
                    "$filter": {
                        value: {
                            author: feed,
                            content: {
                                type: "channel",
                                channel
                            }
                        }
                    }
                }


                pull(
                    sbot.query.read({
                        query: [
                            query
                        ],
                        reverse: true
                    }),
                    pull.collect(function (err, data) {
                        if (err) {
                            reject(err)
                        } else {
                            if (data.length > 0) {
                                resolve(data[0].value.content.subscribed || false)
                            } else {
                                resolve(false)
                            }
                        }
                    })
                )
            } else {
                reject("no sbot")
            }
        })
    }

    subscribedChannels(channel, feed) {
        return new Promise((resolve, reject) => {
            let pull = hermiebox.modules.pullStream
            let sbot = hermiebox.sbot || false

            if (sbot) {
                if (!feed) {
                    feed = sbot.id
                }

                let query = {
                    "$filter": {
                        value: {
                            author: feed,
                            content: {
                                type: "channel"
                            }
                        }
                    },
                    "$map": {
                        channel: ["value", "content", "channel"],
                        subscribed: ["value", "content", "subscribed"]
                    },
                    "$sort": [["value", "timestamp"]]
                }


                pull(
                    sbot.query.read({
                        query: [
                            query
                        ],
                        reverse: true
                    }),
                    pull.collect(function (err, data) {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(data)
                        }
                    })
                )
            } else {
                reject("no sbot")
            }
        })
    }

    follow(feed) {
        return new Promise((resolve, reject) => {
            const sbot = hermiebox.sbot || false

            const msgToPost = {
                "type": "contact",
                "contact": feed,
                "following": true
            }

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }

    unfollow(feed) {
        return new Promise((resolve, reject) => {
            const sbot = hermiebox.sbot || false

            const msgToPost = {
                "type": "contact",
                "contact": feed,
                "following": false
            }

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }

    block(feed) {
        return new Promise((resolve, reject) => {
            const sbot = hermiebox.sbot || false

            const msgToPost = {
                "type": "contact",
                "contact": feed,
                "blocking": true
            }

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }

    unblock(feed) {
        return new Promise((resolve, reject) => {
            const sbot = hermiebox.sbot || false

            const msgToPost = {
                "type": "contact",
                "contact": feed,
                "blocking": false
            }

            if (sbot) {
                sbot.publish(msgToPost, function (err, msg) {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(msg)
                    }
                })
            }
        })
    }

    following(feed, byWhom) {
        return new Promise((resolve, reject) => {
            let pull = hermiebox.modules.pullStream
            let sbot = hermiebox.sbot || false

            if (sbot) {
                if (!byWhom) {
                    byWhom = sbot.id
                }

                let query = {
                    "$filter": {
                        value: {
                            author: byWhom,
                            content: {
                                type: "contact",
                                contact: feed,
                                following: { $is: "boolean" }
                            }
                        }
                    }
                }


                pull(
                    sbot.query.read({
                        query: [
                            query
                        ],
                        reverse: true
                    }),
                    pull.collect(function (err, data) {
                        if (err) {
                            reject(err)
                        } else {
                            if (data.length > 0) {
                                resolve(data[0].value.content.following || false)
                            } else {
                                resolve(false)
                            }
                        }
                    })
                )
            } else {
                reject("no sbot")
            }
        })
    }

    blocking(feed, byWhom) {
        return new Promise((resolve, reject) => {
            let pull = hermiebox.modules.pullStream
            let sbot = hermiebox.sbot || false

            if (sbot) {
                if (!byWhom) {
                    byWhom = sbot.id
                }

                let query = {
                    "$filter": {
                        value: {
                            author: byWhom,
                            content: {
                                type: "contact",
                                contact: feed,
                                blocking: { $is: "boolean" }
                            }
                        }
                    }
                }


                pull(
                    sbot.query.read({
                        query: [
                            query
                        ],
                        reverse: true
                    }),
                    pull.collect(function (err, data) {
                        if (err) {
                            reject(err)
                        } else {
                            if (data.length > 0) {
                                resolve(data[0].value.content.blocking || false)
                            } else {
                                resolve(false)
                            }
                        }
                    })
                )
            } else {
                reject("no sbot")
            }
        })
    }

    query(filter, reverse, map, reduce) {
        return new Promise((resolve, reject) => {
            if (sbot) {

                let query = {
                    "$filter": filter
                }

                if (map) {
                    query.$map = map
                }

                if (reduce) {
                    query.$reduce = reduce
                }

                if (typeof reverse == "undefined") {
                    reverse = true
                }

                pull(
                    sbot.query.read({
                        query: [
                            query
                        ],
                        reverse: reverse
                    }),
                    this.filterTypes(),
                    this.filterLimit(),
                    pull.collect((err, data) => {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(data)
                        }
                    })
                )
            } else {
                reject("no sbot")
            }
        })
    }
}

module.exports.SSB = SSB
},{"./abusePrevention.js":14,"./prefs.js":28}],30:[function(require,module,exports){
const { writable, derived } = require("svelte/store")
const { SSB } = require("./ssb")
const { savedKeys } = require("./prefs.js")

const queryString = require("query-string")
const Public = require("./views/Public.svelte")
const Default = require("./views/Default.svelte")
const Compose = require("./views/compose/Compose.svelte")
const ComposeBlog = require("./views/compose/blog/ComposeBlog.svelte")
const Thread = require("./views/Thread.svelte")
const Profile = require("./views/Profile.svelte")
const ErrorView = require("./views/ErrorView.svelte")
const Channels = require("./views/Channels.svelte")
const Channel = require("./views/Channel.svelte")
const Mentions = require("./views/Mentions.svelte")
const Settings = require("./views/Settings/Settings.svelte")
const Search = require("./views/Search.svelte");

const parseLocation = () => {
  let data = queryString.parse(window.location.search)
  let loc = window.location.hash.slice(1).replace("?", "")
  return { data, location: loc }
};

const intercept = () => {
  let r = parseLocation()
  if (r.location == "/intercept" && r.data.query) {
    let hash = r.data.query.replace("ssb:", "")
    let sigil = hash[0]
    switch (sigil) {
      case "%":
        window.location = `/index.html?thread=${encodeURIComponent(hash)}#/thread`
        break
      case "&":
        window.location = `http://localhost:8989/blobs/get/${hash}`
        break
      case "@":
        window.location = `/index.html?feed=${encodeURIComponent(hash)}#/profile`
        break
      case "#":
        window.location = `/index.html?channel=${hash.replace("#","")}#/channel` 
        break
    }
  }
}

const connected = writable(false);

// maybe in the future, migrate routing system to:
// https://github.com/ItalyPaleAle/svelte-spa-router
const route = writable(parseLocation());
const routeParams = derived(route, $route => $route.data)
const routeLocation = derived(route, $route => $route.location)

const navigate = (location, data) => {
  data = data || {}
  route.set({ location, data });
  let dataAsQuery = queryString.stringify(data);
  let url = `/index.html?${dataAsQuery}#${location}`;
  console.log("navigate url", url)
  history.pushState({ location, data }, `Patchfox - ${location}`, `/index.html?${dataAsQuery}#${location}`);
  console.log(`Navigate ${location}`, data);
};


const routes = {
  "/thread": Thread,
  "/public": Public,
  "/compose/post": Compose,
  "/compose/blog": ComposeBlog,
  "/compose": Compose,
  "/profile": Profile,
  "/error": ErrorView,
  "/channels": Channels,
  "/channel": Channel,
  "/settings": Settings,
  "/mentions": Mentions,
  "/search": Search,
  "*": Default
};



const currentView = derived([connected, route], ([$connected, $route]) => {
  let r = $route.location
  if ($connected) {
    if (routes.hasOwnProperty(r)) {
      return routes[r];
    } else {
      console.log("didn't find", r);
      return routes["*"];
    }
  } else {
    if (r === "/settings") {
      return Settings
    } else {
      return routes["*"];
    }
  }


});


/// connection stuff

const configurationMissing = () => {
  console.log("config missing");
  window.location = "/docs/index.html#/troubleshooting/no-configuration";
};

const cantConnect = () => {
  console.log("config missing");
  window.location = "/docs/index.html#/troubleshooting/no-connection";
};

const connect = async () => {
  console.log("Connecting to sbot...")
  window.ssb = new SSB();

  try {
    await ssb.connect(savedKeys())
    connected.set(true);
  } catch (err) {
    console.error("can't connect", err);
    connected.set(false)
    throw "Can't connect to sbot"
  }
}

const reconnect = () => {
  return new Promise((resolve, reject) => {
    const tryConnect = (data) => {
      window.ssb = new SSB();

      ssb
        .connect(data.keys)
        .then(data => {
          console.log("connected");
          connected.set(true);
          resolve()
        })
        .catch(err => {
          console.error("can't reconnect", err);
          reject(err);
        });
    }

    browser.storage.local
      .get()
      .then(tryConnect, reject);
  })
}

const loadCaches = async () => {
  await ssb.loadCaches();
}

const keepPinging = () => {
  let interval = setInterval(() => {
    if (hermiebox.sbot) {
      hermiebox.sbot.whoami((err, v) => {
        if (err) {
          console.error("can't call whoami", err);
          reconnect().catch(n => {
            console.error("can't reconnect");
            clearInterval(interval);
            navigate("/error", { error: n });
          });
        }
      });
    }
  }, 5000);
}

module.exports = {
  connected,
  parseLocation,
  routeParams,
  intercept,
  connect,
  route,
  routeParams,
  routeLocation,
  navigate,
  currentView,
  reconnect,
  keepPinging,
  loadCaches
}
},{"./prefs.js":28,"./ssb":29,"./views/Channel.svelte":31,"./views/Channels.svelte":32,"./views/Default.svelte":33,"./views/ErrorView.svelte":34,"./views/Mentions.svelte":35,"./views/Profile.svelte":36,"./views/Public.svelte":37,"./views/Search.svelte":38,"./views/Settings/Settings.svelte":46,"./views/Thread.svelte":47,"./views/compose/Compose.svelte":48,"./views/compose/blog/ComposeBlog.svelte":49,"query-string":3,"svelte/store":9}],31:[function(require,module,exports){
/* Channel.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	check_outros,
	component_subscribe,
	destroy_component,
	detach,
	element,
	empty,
	globals,
	group_outros,
	init,
	insert,
	listen,
	mount_component,
	noop,
	outro_and_destroy_block,
	prevent_default,
	run_all,
	safe_not_equal,
	space,
	stop_propagation,
	text,
	transition_in,
	transition_out,
	update_keyed_each,
	validate_store
} = require("svelte/internal");

const { Object: Object_1, document: document_1 } = globals;

const file = "Channel.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-kdiu44-style';
	style.textContent = "\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2hhbm5lbC5zdmVsdGUiLCJzb3VyY2VzIjpbIkNoYW5uZWwuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XHJcbiAgY29uc3QgTWVzc2FnZVJlbmRlcmVyID0gcmVxdWlyZShcIi4uL21lc3NhZ2VUeXBlcy9NZXNzYWdlUmVuZGVyZXIuc3ZlbHRlXCIpO1xyXG4gIGNvbnN0IHsgbmF2aWdhdGUsIHJvdXRlUGFyYW1zIH0gPSByZXF1aXJlKFwiLi4vdXRpbHMuanNcIik7XHJcbiAgY29uc3QgeyBnZXRQcmVmIH0gPSByZXF1aXJlKFwiLi4vcHJlZnMuanNcIilcclxuICBjb25zdCB7IG9uTW91bnQsIG9uRGVzdHJveSB9ID0gcmVxdWlyZShcInN2ZWx0ZVwiKTtcclxuXHJcbiAgbGV0IG1zZ3MgPSBmYWxzZTtcclxuICBsZXQgZXJyb3IgPSAkcm91dGVQYXJhbXMuZXJyb3IgfHwgZmFsc2U7XHJcbiAgbGV0IGNoYW5uZWwgPSAkcm91dGVQYXJhbXMuY2hhbm5lbCB8fCBmYWxzZTtcclxuICBsZXQgc3Vic2NyaWJlZCA9IGZhbHNlO1xyXG5cclxuICBpZiAoIWNoYW5uZWwpIHtcclxuICAgIGNvbnNvbGUubG9nKFwiY2FuJ3QgbmF2aWdhdGUgdG8gdW5uYW1lZCBjaGFubmVsLCBnb2luZyBiYWNrIHRvIHB1YmxpY1wiKTtcclxuICAgIGxvY2F0aW9uID0gXCJpbmRleC5odG1sIy9wdWJsaWNcIjsgLy8gZm9yY2UgcmVsb2FkLlxyXG4gIH1cclxuXHJcbiAgbGV0IG9wdHMgPSB7XHJcbiAgICBsaW1pdDogJHJvdXRlUGFyYW1zLmxpbWl0IHx8IGdldFByZWYoXCJsaW1pdFwiLCAxMCksXHJcbiAgICByZXZlcnNlOiB0cnVlXHJcbiAgfTtcclxuXHJcbiAgc3NiLmNoYW5uZWxTdWJzY3JpYmVkKGNoYW5uZWwpLnRoZW4ocyA9PiAoc3Vic2NyaWJlZCA9IHMpKTtcclxuXHJcbiAgLy8gdG9kbzogbW92ZSBiYWNrIGludG8gdXNpbmcgc3RvcmVzLlxyXG4gICQ6IHtcclxuICAgIE9iamVjdC5hc3NpZ24ob3B0cywgJHJvdXRlUGFyYW1zKTtcclxuXHJcbiAgICBkb2N1bWVudC50aXRsZSA9IGBQYXRjaGZveCAtICMke2NoYW5uZWx9YDtcclxuXHJcbiAgICBpZiAob3B0cy5oYXNPd25Qcm9wZXJ0eShcImx0XCIpKSB7XHJcbiAgICAgIG9wdHMubHQgPSBwYXJzZUludChvcHRzLmx0KTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAob3B0cy5oYXNPd25Qcm9wZXJ0eShcImxpbWl0XCIpKSB7XHJcbiAgICAgIG9wdHMubGltaXQgPSBwYXJzZUludChvcHRzLmxpbWl0KTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgcHJvbWlzZSA9IHNzYlxyXG4gICAgICAuY2hhbm5lbChjaGFubmVsLCBvcHRzKVxyXG4gICAgICAudGhlbihtcyA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJtc2dcIiwgbXMpO1xyXG4gICAgICAgIG1zZ3MgPSBtcztcclxuICAgICAgICB3aW5kb3cuc2Nyb2xsVG8oMCwgMCk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChuID0+IHtcclxuICAgICAgICBpZiAoIWVycm9yKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZXJycnJvb29vb3JcIiwgbik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHN1YnNjcmlwdGlvbkNoYW5nZWQgPSBldiA9PiB7XHJcbiAgICBsZXQgdiA9IGV2LnRhcmdldC5jaGVja2VkO1xyXG4gICAgaWYgKHYpIHtcclxuICAgICAgc3NiLmNoYW5uZWxTdWJzY3JpYmUoY2hhbm5lbCkuY2F0Y2goKCkgPT4gKHN1YnNjcmliZWQgPSBmYWxzZSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgc3NiLmNoYW5uZWxVbnN1YnNjcmliZShjaGFubmVsKS5jYXRjaCgoKSA9PiAoc3Vic2NyaWJlZCA9IHRydWUpKTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBnb05leHQgPSAoKSA9PiB7XHJcbiAgICBuYXZpZ2F0ZShcIi9jaGFubmVsXCIsIHtcclxuICAgICAgY2hhbm5lbCxcclxuICAgICAgbHQ6IG1zZ3NbbXNncy5sZW5ndGggLSAxXS5ydHNcclxuICAgIH0pO1xyXG4gIH07XHJcbiAgY29uc3QgZ29QcmV2aW91cyA9ICgpID0+IHtcclxuICAgIGhpc3RvcnkuYmFjaygpO1xyXG4gIH07XHJcbjwvc2NyaXB0PlxyXG5cclxuPHN0eWxlPlxyXG4gIC5tZW51LXJpZ2h0IHtcclxuICAgIHJpZ2h0OiAwcHg7XHJcbiAgICBsZWZ0OiB1bnNldDtcclxuICAgIG1pbi13aWR0aDogMzAwcHg7XHJcbiAgfVxyXG48L3N0eWxlPlxyXG5cclxuPGRpdiBjbGFzcz1cImNvbnRhaW5lclwiPlxyXG4gIDxkaXYgY2xhc3M9XCJjb2x1bW5zXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29sdW1uXCI+XHJcbiAgICAgIDxoND5DaGFubmVsOiAje2NoYW5uZWx9IDwvaDQ+XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2x1bW5cIj5cclxuICAgICAgPGxhYmVsIGNsYXNzPVwiZm9ybS1zd2l0Y2ggZmxvYXQtcmlnaHRcIj5cclxuICAgICAgICA8aW5wdXRcclxuICAgICAgICAgIHR5cGU9XCJjaGVja2JveFwiXHJcbiAgICAgICAgICBvbjpjaGFuZ2U9e3N1YnNjcmlwdGlvbkNoYW5nZWR9XHJcbiAgICAgICAgICBiaW5kOmNoZWNrZWQ9e3N1YnNjcmliZWR9IC8+XHJcbiAgICAgICAgPGkgY2xhc3M9XCJmb3JtLWljb25cIiAvPlxyXG4gICAgICAgIFN1YnNjcmliZVxyXG4gICAgICA8L2xhYmVsPlxyXG4gICAgICA8YnV0dG9uXHJcbiAgICAgICAgY2xhc3M9XCJidG4gYnRuLWxpbmsgZmxvYXQtcmlnaHRcIlxyXG4gICAgICAgIGhyZWY9XCI/Y2hhbm5lbD17Y2hhbm5lbH0jL2NvbXBvc2VcIlxyXG4gICAgICAgIG9uOmNsaWNrfHByZXZlbnREZWZhdWx0PXsoKSA9PiBuYXZpZ2F0ZSgnL2NvbXBvc2UnLCB7IGNoYW5uZWwgfSl9PlxyXG4gICAgICAgIE5ldyBQb3N0XHJcbiAgICAgIDwvYnV0dG9uPlxyXG4gICAgPC9kaXY+XHJcbiAgPC9kaXY+XHJcbjwvZGl2PlxyXG57I2lmIGVycm9yfVxyXG4gIDxkaXYgY2xhc3M9XCJ0b2FzdCB0b2FzdC1lcnJvclwiPkVycm9yOiB7ZXJyb3J9PC9kaXY+XHJcbnsvaWZ9XHJcbnsjaWYgIW1zZ3N9XHJcbiAgPGRpdiBjbGFzcz1cImxvYWRpbmcgbG9hZGluZy1sZ1wiIC8+XHJcbns6ZWxzZX1cclxuICB7I2VhY2ggbXNncyBhcyBtc2cgKG1zZy5rZXkpfVxyXG4gICAgPE1lc3NhZ2VSZW5kZXJlciB7bXNnfSAvPlxyXG4gIHs6ZWxzZX1cclxuICAgIDxwPk5vIG1lc3NhZ2VzLjwvcD5cclxuICB7L2VhY2h9XHJcbiAgPHVsIGNsYXNzPVwicGFnaW5hdGlvblwiPlxyXG4gICAgPGxpIGNsYXNzPVwicGFnZS1pdGVtIHBhZ2UtcHJldmlvdXNcIj5cclxuICAgICAgPGEgaHJlZj1cIiMvcHVibGljXCIgb246Y2xpY2t8c3RvcFByb3BhZ2F0aW9ufHByZXZlbnREZWZhdWx0PXtnb1ByZXZpb3VzfT5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicGFnZS1pdGVtLXN1YnRpdGxlXCI+UHJldmlvdXM8L2Rpdj5cclxuICAgICAgPC9hPlxyXG4gICAgPC9saT5cclxuICAgIDxsaSBjbGFzcz1cInBhZ2UtaXRlbSBwYWdlLW5leHRcIj5cclxuICAgICAgPGEgaHJlZj1cIiMvcHVibGljXCIgb246Y2xpY2t8c3RvcFByb3BhZ2F0aW9ufHByZXZlbnREZWZhdWx0PXtnb05leHR9PlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJwYWdlLWl0ZW0tc3VidGl0bGVcIj5OZXh0PC9kaXY+XHJcbiAgICAgIDwvYT5cclxuICAgIDwvbGk+XHJcbiAgPC91bD5cclxuey9pZn1cclxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiIifQ== */";
	append(document_1.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = Object_1.create(ctx);
	child_ctx.msg = list[i];
	return child_ctx;
}

// (103:0) {#if error}
function create_if_block_1(ctx) {
	var div, t0, t1;

	return {
		c: function create() {
			div = element("div");
			t0 = text("Error: ");
			t1 = text(ctx.error);
			attr(div, "class", "toast toast-error");
			add_location(div, file, 103, 2, 2518);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
		},

		p: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (108:0) {:else}
function create_else_block(ctx) {
	var each_blocks = [], each_1_lookup = new Map(), t0, ul, li0, a0, div0, t2, li1, a1, div1, current, dispose;

	var each_value = ctx.msgs;

	const get_key = ctx => ctx.msg.key;

	for (var i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	var each_1_else = null;

	if (!each_value.length) {
		each_1_else = create_else_block_1(ctx);
		each_1_else.c();
	}

	return {
		c: function create() {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();

			t0 = space();
			ul = element("ul");
			li0 = element("li");
			a0 = element("a");
			div0 = element("div");
			div0.textContent = "Previous";
			t2 = space();
			li1 = element("li");
			a1 = element("a");
			div1 = element("div");
			div1.textContent = "Next";
			attr(div0, "class", "page-item-subtitle");
			add_location(div0, file, 116, 8, 2906);
			attr(a0, "href", "#/public");
			add_location(a0, file, 115, 6, 2824);
			attr(li0, "class", "page-item page-previous");
			add_location(li0, file, 114, 4, 2780);
			attr(div1, "class", "page-item-subtitle");
			add_location(div1, file, 121, 8, 3099);
			attr(a1, "href", "#/public");
			add_location(a1, file, 120, 6, 3021);
			attr(li1, "class", "page-item page-next");
			add_location(li1, file, 119, 4, 2981);
			attr(ul, "class", "pagination");
			add_location(ul, file, 113, 2, 2751);

			dispose = [
				listen(a0, "click", stop_propagation(prevent_default(ctx.goPrevious))),
				listen(a1, "click", stop_propagation(prevent_default(ctx.goNext)))
			];
		},

		m: function mount(target, anchor) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(target, anchor);

			if (each_1_else) {
				each_1_else.m(target, anchor);
			}

			insert(target, t0, anchor);
			insert(target, ul, anchor);
			append(ul, li0);
			append(li0, a0);
			append(a0, div0);
			append(ul, t2);
			append(ul, li1);
			append(li1, a1);
			append(a1, div1);
			current = true;
		},

		p: function update(changed, ctx) {
			const each_value = ctx.msgs;

			group_outros();
			each_blocks = update_keyed_each(each_blocks, changed, get_key, 1, ctx, each_value, each_1_lookup, t0.parentNode, outro_and_destroy_block, create_each_block, t0, get_each_context);
			check_outros();

			if (each_value.length) {
				if (each_1_else) {
					each_1_else.d(1);
					each_1_else = null;
				}
			} else if (!each_1_else) {
				each_1_else = create_else_block_1(ctx);
				each_1_else.c();
				each_1_else.m(t0.parentNode, t0);
			}
		},

		i: function intro(local) {
			if (current) return;
			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o: function outro(local) {
			for (i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d: function destroy(detaching) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d(detaching);

			if (each_1_else) each_1_else.d(detaching);

			if (detaching) {
				detach(t0);
				detach(ul);
			}

			run_all(dispose);
		}
	};
}

// (106:0) {#if !msgs}
function create_if_block(ctx) {
	var div;

	return {
		c: function create() {
			div = element("div");
			attr(div, "class", "loading loading-lg");
			add_location(div, file, 106, 2, 2593);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (111:2) {:else}
function create_else_block_1(ctx) {
	var p;

	return {
		c: function create() {
			p = element("p");
			p.textContent = "No messages.";
			add_location(p, file, 111, 4, 2717);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (109:2) {#each msgs as msg (msg.key)}
function create_each_block(key_1, ctx) {
	var first, current;

	var messagerenderer = new ctx.MessageRenderer({
		props: { msg: ctx.msg },
		$$inline: true
	});

	return {
		key: key_1,

		first: null,

		c: function create() {
			first = empty();
			messagerenderer.$$.fragment.c();
			this.first = first;
		},

		m: function mount(target, anchor) {
			insert(target, first, anchor);
			mount_component(messagerenderer, target, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			var messagerenderer_changes = {};
			if (changed.msgs) messagerenderer_changes.msg = ctx.msg;
			messagerenderer.$set(messagerenderer_changes);
		},

		i: function intro(local) {
			if (current) return;
			transition_in(messagerenderer.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(messagerenderer.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(first);
			}

			destroy_component(messagerenderer, detaching);
		}
	};
}

function create_fragment(ctx) {
	var div3, div2, div0, h4, t0, t1, t2, div1, label, input, t3, i, t4, t5, button, t6, button_href_value, t7, t8, current_block_type_index, if_block1, if_block1_anchor, current, dispose;

	var if_block0 = (ctx.error) && create_if_block_1(ctx);

	var if_block_creators = [
		create_if_block,
		create_else_block
	];

	var if_blocks = [];

	function select_block_type(ctx) {
		if (!ctx.msgs) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c: function create() {
			div3 = element("div");
			div2 = element("div");
			div0 = element("div");
			h4 = element("h4");
			t0 = text("Channel: #");
			t1 = text(ctx.channel);
			t2 = space();
			div1 = element("div");
			label = element("label");
			input = element("input");
			t3 = space();
			i = element("i");
			t4 = text("\r\n        Subscribe");
			t5 = space();
			button = element("button");
			t6 = text("New Post");
			t7 = space();
			if (if_block0) if_block0.c();
			t8 = space();
			if_block1.c();
			if_block1_anchor = empty();
			add_location(h4, file, 82, 6, 1951);
			attr(div0, "class", "column");
			add_location(div0, file, 81, 4, 1923);
			attr(input, "type", "checkbox");
			add_location(input, file, 86, 8, 2075);
			attr(i, "class", "form-icon");
			add_location(i, file, 90, 8, 2201);
			attr(label, "class", "form-switch float-right");
			add_location(label, file, 85, 6, 2026);
			attr(button, "class", "btn btn-link float-right");
			attr(button, "href", button_href_value = "?channel=" + ctx.channel + "#/compose");
			add_location(button, file, 93, 6, 2267);
			attr(div1, "class", "column");
			add_location(div1, file, 84, 4, 1998);
			attr(div2, "class", "columns");
			add_location(div2, file, 80, 2, 1896);
			attr(div3, "class", "container");
			add_location(div3, file, 79, 0, 1869);

			dispose = [
				listen(input, "change", ctx.input_change_handler),
				listen(input, "change", ctx.subscriptionChanged),
				listen(button, "click", prevent_default(ctx.click_handler))
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div3, anchor);
			append(div3, div2);
			append(div2, div0);
			append(div0, h4);
			append(h4, t0);
			append(h4, t1);
			append(div2, t2);
			append(div2, div1);
			append(div1, label);
			append(label, input);

			input.checked = ctx.subscribed;

			append(label, t3);
			append(label, i);
			append(label, t4);
			append(div1, t5);
			append(div1, button);
			append(button, t6);
			insert(target, t7, anchor);
			if (if_block0) if_block0.m(target, anchor);
			insert(target, t8, anchor);
			if_blocks[current_block_type_index].m(target, anchor);
			insert(target, if_block1_anchor, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			if (changed.subscribed) input.checked = ctx.subscribed;

			if (ctx.error) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(t8.parentNode, t8);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block1 = if_blocks[current_block_type_index];
				if (!if_block1) {
					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block1.c();
				}
				transition_in(if_block1, 1);
				if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(if_block1);
			current = true;
		},

		o: function outro(local) {
			transition_out(if_block1);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div3);
				detach(t7);
			}

			if (if_block0) if_block0.d(detaching);

			if (detaching) {
				detach(t8);
			}

			if_blocks[current_block_type_index].d(detaching);

			if (detaching) {
				detach(if_block1_anchor);
			}

			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $routeParams;

	const MessageRenderer = require("../messageTypes/MessageRenderer.svelte");
  const { navigate, routeParams } = require("../utils.js"); validate_store(routeParams, 'routeParams'); component_subscribe($$self, routeParams, $$value => { $routeParams = $$value; $$invalidate('$routeParams', $routeParams) });
  const { getPref } = require("../prefs.js")
  const { onMount, onDestroy } = require("svelte");

  let msgs = false;
  let error = $routeParams.error || false;
  let channel = $routeParams.channel || false;
  let subscribed = false;

  if (!channel) {
    console.log("can't navigate to unnamed channel, going back to public");
    location = "index.html#/public"; // force reload.
  }

  let opts = {
    limit: $routeParams.limit || getPref("limit", 10),
    reverse: true
  };

  ssb.channelSubscribed(channel).then(s => { const $$result = (subscribed = s); $$invalidate('subscribed', subscribed); return $$result; });

  const subscriptionChanged = ev => {
    let v = ev.target.checked;
    if (v) {
      ssb.channelSubscribe(channel).catch(() => { const $$result = (subscribed = false); $$invalidate('subscribed', subscribed); return $$result; });
    } else {
      ssb.channelUnsubscribe(channel).catch(() => { const $$result = (subscribed = true); $$invalidate('subscribed', subscribed); return $$result; });
    }
  };

  const goNext = () => {
    navigate("/channel", {
      channel,
      lt: msgs[msgs.length - 1].rts
    });
  };
  const goPrevious = () => {
    history.back();
  };

	function input_change_handler() {
		subscribed = this.checked;
		$$invalidate('subscribed', subscribed);
	}

	function click_handler() {
		return navigate('/compose', { channel });
	}

	$$self.$$.update = ($$dirty = { opts: 1, $routeParams: 1, channel: 1, error: 1 }) => {
		if ($$dirty.opts || $$dirty.$routeParams || $$dirty.channel || $$dirty.error) { {
        Object.assign(opts, $routeParams);
    
        document.title = `Patchfox - #${channel}`;
    
        if (opts.hasOwnProperty("lt")) {
          opts.lt = parseInt(opts.lt); $$invalidate('opts', opts), $$invalidate('$routeParams', $routeParams), $$invalidate('channel', channel), $$invalidate('error', error);
        }
    
        if (opts.hasOwnProperty("limit")) {
          opts.limit = parseInt(opts.limit); $$invalidate('opts', opts), $$invalidate('$routeParams', $routeParams), $$invalidate('channel', channel), $$invalidate('error', error);
        }
    
        let promise = ssb
          .channel(channel, opts)
          .then(ms => {
            console.log("msg", ms);
            $$invalidate('msgs', msgs = ms);
            window.scrollTo(0, 0);
          })
          .catch(n => {
            if (!error) {
              console.error("errrrooooor", n);
            }
          });
      } }
	};

	return {
		MessageRenderer,
		navigate,
		routeParams,
		msgs,
		error,
		channel,
		subscribed,
		subscriptionChanged,
		goNext,
		goPrevious,
		input_change_handler,
		click_handler
	};
}

class Channel extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document_1.getElementById("svelte-kdiu44-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Channel;

},{"../messageTypes/MessageRenderer.svelte":21,"../prefs.js":28,"../utils.js":30,"svelte":7,"svelte/internal":8}],32:[function(require,module,exports){
/* Channels.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	destroy_each,
	detach,
	element,
	empty,
	init,
	insert,
	listen,
	noop,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");
const { navigate } = require("../utils.js");

const file = "Channels.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-1or0a5q-style';
	style.textContent = ".channel.svelte-1or0a5q{cursor:pointer}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2hhbm5lbHMuc3ZlbHRlIiwic291cmNlcyI6WyJDaGFubmVscy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cclxuICAvLyBOT1RJQ0U6XHJcbiAgLy8gSSd2ZSByZW1vdmVkIHRoaXMgdmlldyBmcm9tIHRoZSBuYXZpZ2F0aW9uLlxyXG4gIC8vXHJcbiAgLy8gaXQgaXMgdG9vIHNsb3csIGl0IHRha2VzIGFib3V0IDYwIHNlY29uZHMgdG8gcXVlcnkuXHJcbiAgLy9cclxuXHJcbiAgaW1wb3J0IHsgbmF2aWdhdGUgfSBmcm9tIFwiLi4vdXRpbHMuanNcIjtcclxuXHJcbiAgbGV0IGFjdGl2ZUNoYW5uZWxzID0gW107XHJcbiAgbGV0IHN1YnNjcmliZWRDaGFubmVscyA9IFtdO1xyXG5cclxuICBsZXQgbG9hZGluZyA9IHRydWU7XHJcblxyXG4gIGxldCBwdWxsID0gaGVybWllYm94Lm1vZHVsZXMucHVsbFN0cmVhbTtcclxuICBsZXQgc2JvdCA9IGhlcm1pZWJveC5zYm90O1xyXG5cclxuICBjb25zdCBsb2FkU3Vic2NyaWJlZENoYW5uZWxzID0gKCkgPT4ge1xyXG4gICAgbGV0IHF1ZXJ5ID0ge1xyXG4gICAgICAkZmlsdGVyOiB7XHJcbiAgICAgICAgdmFsdWU6IHtcclxuICAgICAgICAgIGF1dGhvcjogc2JvdC5pZCxcclxuICAgICAgICAgIGNvbnRlbnQ6IHtcclxuICAgICAgICAgICAgdHlwZTogXCJjaGFubmVsXCJcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgICRzb3J0OiBbW1widmFsdWVcIiwgXCJ0aW1lc3RhbXBcIl1dXHJcbiAgICB9O1xyXG4gICAgcHVsbChcclxuICAgICAgc2JvdC5xdWVyeS5yZWFkKHtcclxuICAgICAgICBxdWVyeTogW3F1ZXJ5XSxcclxuICAgICAgICBsaXZlOiB0cnVlLFxyXG4gICAgICAgIHJldmVyc2U6IHRydWUsXHJcbiAgICAgICAgbGltaXQ6IDUwMFxyXG4gICAgICB9KSxcclxuICAgICAgLy9wdWxsLmZpbHRlcihjID0+IHtcclxuICAgICAgLy8gICFzdWJzY3JpYmVkQ2hhbm5lbHMuc29tZShzYyA9PiBzYy5jaGFubmVsID09IGMuY2hhbm5lbCk7XHJcbiAgICAgIC8vfSksXHJcbiAgICAgIHB1bGwuZHJhaW4oYyA9PiB7XHJcbiAgICAgICAgaWYgKGMuc3luYykge1xyXG4gICAgICAgICAgY29uc29sZS5sb2coXCJmaW5pc2hlZCBsb2FkaW5nXCIpO1xyXG4gICAgICAgICAgbG9hZGluZyA9IGZhbHNlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpZiAoYy52YWx1ZS5jb250ZW50LnN1YnNjcmliZWQpIHtcclxuICAgICAgICAgICAgc3Vic2NyaWJlZENoYW5uZWxzLnB1c2goYy52YWx1ZS5jb250ZW50LmNoYW5uZWwpO1xyXG4gICAgICAgICAgICBzdWJzY3JpYmVkQ2hhbm5lbHMgPSBzdWJzY3JpYmVkQ2hhbm5lbHM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuICB9O1xyXG5cclxuICBsb2FkU3Vic2NyaWJlZENoYW5uZWxzKCk7XHJcbjwvc2NyaXB0PlxyXG5cclxuPHN0eWxlPlxyXG4gIC5jaGFubmVsIHtcclxuICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICB9XHJcbjwvc3R5bGU+XHJcblxyXG48aDQ+U3Vic2NyaWJlZCBDaGFubmVsczwvaDQ+XHJcblxyXG57I2lmIHN1YnNjcmliZWRDaGFubmVscy5sZW5ndGggPT0gMH1cclxuICA8ZGl2IGNsYXNzPVwibG9hZGluZ1wiIC8+XHJcblxyXG4gIDxwPlRoaXMgaXMgYSBjb21wbGV4IHF1ZXJ5LCBpdCBtaWdodCB0YWtlIGEgd2hpbGUuLi4gQ2hhbm5lbHMgd2lsbCBhcHBlYXIgYXMgd2UgZmluZCB0aGVtPC9wPlxyXG57OmVsc2V9XHJcbiAgeyNlYWNoIHN1YnNjcmliZWRDaGFubmVscyBhcyBjfVxyXG4gICAgPHNwYW5cclxuICAgICAgY2xhc3M9XCJjaGFubmVsIGxhYmVsIGxhYmVsLXNlY29uZGFyeSBtLTFcIlxyXG4gICAgICBvbjpjbGljaz17KCkgPT4gbmF2aWdhdGUoJy9jaGFubmVsJywgeyBjaGFubmVsOiBjIH0pfT5cclxuICAgICAgICN7Y31cclxuICAgIDwvc3Bhbj5cclxuICB7L2VhY2h9XHJcbnsvaWZ9XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUF5REUsUUFBUSxlQUFDLENBQUMsQUFDUixNQUFNLENBQUUsT0FBTyxBQUNqQixDQUFDIn0= */";
	append(document.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.c = list[i];
	return child_ctx;
}

// (69:0) {:else}
function create_else_block(ctx) {
	var each_1_anchor;

	var each_value = ctx.subscribedChannels;

	var each_blocks = [];

	for (var i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c: function create() {
			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},

		m: function mount(target, anchor) {
			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert(target, each_1_anchor, anchor);
		},

		p: function update(changed, ctx) {
			if (changed.subscribedChannels) {
				each_value = ctx.subscribedChannels;

				for (var i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(changed, child_ctx);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}
				each_blocks.length = each_value.length;
			}
		},

		d: function destroy(detaching) {
			destroy_each(each_blocks, detaching);

			if (detaching) {
				detach(each_1_anchor);
			}
		}
	};
}

// (65:0) {#if subscribedChannels.length == 0}
function create_if_block(ctx) {
	var div, t, p;

	return {
		c: function create() {
			div = element("div");
			t = space();
			p = element("p");
			p.textContent = "This is a complex query, it might take a while... Channels will appear as we find them";
			attr(div, "class", "loading");
			add_location(div, file, 65, 2, 1383);
			add_location(p, file, 67, 2, 1412);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			insert(target, t, anchor);
			insert(target, p, anchor);
		},

		p: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
				detach(t);
				detach(p);
			}
		}
	};
}

// (70:2) {#each subscribedChannels as c}
function create_each_block(ctx) {
	var span, t0, t1_value = ctx.c, t1, t2, dispose;

	function click_handler() {
		return ctx.click_handler(ctx);
	}

	return {
		c: function create() {
			span = element("span");
			t0 = text("#");
			t1 = text(t1_value);
			t2 = space();
			attr(span, "class", "channel label label-secondary m-1 svelte-1or0a5q");
			add_location(span, file, 70, 4, 1555);
			dispose = listen(span, "click", click_handler);
		},

		m: function mount(target, anchor) {
			insert(target, span, anchor);
			append(span, t0);
			append(span, t1);
			append(span, t2);
		},

		p: function update(changed, new_ctx) {
			ctx = new_ctx;
			if ((changed.subscribedChannels) && t1_value !== (t1_value = ctx.c)) {
				set_data(t1, t1_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(span);
			}

			dispose();
		}
	};
}

function create_fragment(ctx) {
	var h4, t_1, if_block_anchor;

	function select_block_type(ctx) {
		if (ctx.subscribedChannels.length == 0) return create_if_block;
		return create_else_block;
	}

	var current_block_type = select_block_type(ctx);
	var if_block = current_block_type(ctx);

	return {
		c: function create() {
			h4 = element("h4");
			h4.textContent = "Subscribed Channels";
			t_1 = space();
			if_block.c();
			if_block_anchor = empty();
			add_location(h4, file, 62, 0, 1311);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, h4, anchor);
			insert(target, t_1, anchor);
			if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
		},

		p: function update(changed, ctx) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(changed, ctx);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);
				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h4);
				detach(t_1);
			}

			if_block.d(detaching);

			if (detaching) {
				detach(if_block_anchor);
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let activeChannels = [];
  let subscribedChannels = [];

  let loading = true;

  let pull = hermiebox.modules.pullStream;
  let sbot = hermiebox.sbot;

  const loadSubscribedChannels = () => {
    let query = {
      $filter: {
        value: {
          author: sbot.id,
          content: {
            type: "channel"
          }
        }
      },
      $sort: [["value", "timestamp"]]
    };
    pull(
      sbot.query.read({
        query: [query],
        live: true,
        reverse: true,
        limit: 500
      }),
      //pull.filter(c => {
      //  !subscribedChannels.some(sc => sc.channel == c.channel);
      //}),
      pull.drain(c => {
        if (c.sync) {
          console.log("finished loading");
          loading = false;
        } else {
          if (c.value.content.subscribed) {
            subscribedChannels.push(c.value.content.channel);
            $$invalidate('subscribedChannels', subscribedChannels);
          }
        }
      })
    );
  };

  loadSubscribedChannels();

	function click_handler({ c }) {
		return navigate('/channel', { channel: c });
	}

	return { subscribedChannels, click_handler };
}

class Channels extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-1or0a5q-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Channels;

},{"../utils.js":30,"svelte/internal":8}],33:[function(require,module,exports){
/* Default.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	attr,
	detach,
	element,
	init,
	insert,
	noop,
	safe_not_equal
} = require("svelte/internal");

const file = "Default.svelte";

function create_fragment(ctx) {
	var div;

	return {
		c: function create() {
			div = element("div");
			attr(div, "class", "empty");
			add_location(div, file, 0, 0, 0);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

class Default extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, null, create_fragment, safe_not_equal, []);
	}
}

module.exports = Default;

},{"svelte/internal":8}],34:[function(require,module,exports){
/* ErrorView.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	component_subscribe,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	prevent_default,
	safe_not_equal,
	set_data,
	space,
	stop_propagation,
	text,
	validate_store
} = require("svelte/internal");
const { navigate, routeParams, reconnect } = require("../utils.js");

const file = "ErrorView.svelte";

// (51:2) {#if toast}
function create_if_block_1(ctx) {
	var div, t, div_class_value;

	return {
		c: function create() {
			div = element("div");
			t = text(ctx.msg);
			attr(div, "class", div_class_value = "toast " + ctx.toastClass);
			add_location(div, file, 51, 4, 1208);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t);
		},

		p: function update(changed, ctx) {
			if (changed.msg) {
				set_data(t, ctx.msg);
			}

			if ((changed.toastClass) && div_class_value !== (div_class_value = "toast " + ctx.toastClass)) {
				attr(div, "class", div_class_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (60:4) {#if cta}
function create_if_block(ctx) {
	var li, a, t_value = ctx.cta.label, t, dispose;

	return {
		c: function create() {
			li = element("li");
			a = element("a");
			t = text(t_value);
			attr(a, "href", "#");
			add_location(a, file, 61, 8, 1434);
			add_location(li, file, 60, 6, 1420);
			dispose = listen(a, "click", stop_propagation(prevent_default(ctx.cta.action)));
		},

		m: function mount(target, anchor) {
			insert(target, li, anchor);
			append(li, a);
			append(a, t);
		},

		p: function update(changed, ctx) {
			if ((changed.cta) && t_value !== (t_value = ctx.cta.label)) {
				set_data(t, t_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(li);
			}

			dispose();
		}
	};
}

function create_fragment(ctx) {
	var div, h1, t1, t2, h4, t4, pre, code, t5, t6, p, t8, ul, t9, li0, a0, t11, li1, a1, t13;

	var if_block0 = (ctx.toast) && create_if_block_1(ctx);

	var if_block1 = (ctx.cta) && create_if_block(ctx);

	return {
		c: function create() {
			div = element("div");
			h1 = element("h1");
			h1.textContent = "😿 An Error Has Occurred, sorry 😭";
			t1 = space();
			if (if_block0) if_block0.c();
			t2 = space();
			h4 = element("h4");
			h4.textContent = "This is what we know about it";
			t4 = space();
			pre = element("pre");
			code = element("code");
			t5 = text(ctx.error);
			t6 = space();
			p = element("p");
			p.textContent = "You might want to:";
			t8 = space();
			ul = element("ul");
			if (if_block1) if_block1.c();
			t9 = space();
			li0 = element("li");
			a0 = element("a");
			a0.textContent = "Open our troubleshooting documentation.";
			t11 = space();
			li1 = element("li");
			a1 = element("a");
			a1.textContent = "Add an issue";
			t13 = text("\r\n      to the Patchfox repository.");
			add_location(h1, file, 49, 2, 1144);
			add_location(h4, file, 53, 2, 1264);
			add_location(code, file, 55, 4, 1330);
			attr(pre, "class", "code");
			add_location(pre, file, 54, 2, 1306);
			add_location(p, file, 57, 2, 1364);
			attr(a0, "href", "/docs/index.html#/troubleshooting/");
			attr(a0, "target", "_blank");
			add_location(a0, file, 67, 6, 1579);
			add_location(li0, file, 66, 4, 1567);
			attr(a1, "href", "https://github.com/soapdog/patchfox/issues");
			attr(a1, "target", "_blank");
			add_location(a1, file, 72, 6, 1730);
			add_location(li1, file, 71, 4, 1718);
			add_location(ul, file, 58, 2, 1393);
			attr(div, "class", "container");
			add_location(div, file, 48, 0, 1117);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, h1);
			append(div, t1);
			if (if_block0) if_block0.m(div, null);
			append(div, t2);
			append(div, h4);
			append(div, t4);
			append(div, pre);
			append(pre, code);
			append(code, t5);
			append(div, t6);
			append(div, p);
			append(div, t8);
			append(div, ul);
			if (if_block1) if_block1.m(ul, null);
			append(ul, t9);
			append(ul, li0);
			append(li0, a0);
			append(ul, t11);
			append(ul, li1);
			append(li1, a1);
			append(li1, t13);
		},

		p: function update(changed, ctx) {
			if (ctx.toast) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(div, t2);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (changed.error) {
				set_data(t5, ctx.error);
			}

			if (ctx.cta) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					if_block1.m(ul, t9);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $routeParams;

	validate_store(routeParams, 'routeParams');
	component_subscribe($$self, routeParams, $$value => { $routeParams = $$value; $$invalidate('$routeParams', $routeParams); });

	document.title = `Patchfox - Error`;

  let error = $routeParams.error;
  let errorObj = {};
  let toastClass = "";
  let toast = false;
  let msg;
  let cta = false;

  console.dir(error);
  if (typeof error == "object") {
    errorObj = error;
    $$invalidate('error', error = errorObj.message);
  }

  const tryReconnect = () => {
    $$invalidate('toast', toast = true);
    $$invalidate('toastClass', toastClass = "toast-warning");
    $$invalidate('msg', msg = "Attempting to reconnect to sbot...");
    reconnect()
      .then(() => {
        $$invalidate('toastClass', toastClass = "toast-success");
        $$invalidate('toast', toast = true);
        $$invalidate('msg', msg =
          "Connection to sbot reestablished. Try going to your public feed.");
      })
      .catch(n => {
        $$invalidate('toastClass', toastClass = "toast-error");
        $$invalidate('toast', toast = true);
        $$invalidate('msg', msg = "Couldn't reconnect. Try reloading the page.");
      });
  };

  let errorMapping = {
    "Error: stream is closed": {
      label: "Want to try to reconnect?",
      action: tryReconnect
    }
  };

  if (errorMapping.hasOwnProperty(error)) {
    $$invalidate('cta', cta = errorMapping[error]);
  }

	return { error, toastClass, toast, msg, cta };
}

class ErrorView extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = ErrorView;

},{"../utils.js":30,"svelte/internal":8}],35:[function(require,module,exports){
/* Mentions.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	check_outros,
	destroy_component,
	detach,
	element,
	empty,
	globals,
	group_outros,
	init,
	insert,
	listen,
	mount_component,
	noop,
	outro_and_destroy_block,
	prevent_default,
	run_all,
	safe_not_equal,
	space,
	stop_propagation,
	transition_in,
	transition_out,
	update_keyed_each
} = require("svelte/internal");

const { document: document_1 } = globals;

const file = "Mentions.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-kdiu44-style';
	style.textContent = "\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWVudGlvbnMuc3ZlbHRlIiwic291cmNlcyI6WyJNZW50aW9ucy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cclxuICBjb25zdCBNZXNzYWdlUmVuZGVyZXIgPSByZXF1aXJlKFwiLi4vbWVzc2FnZVR5cGVzL01lc3NhZ2VSZW5kZXJlci5zdmVsdGVcIik7XHJcbiAgY29uc3QgeyBuYXZpZ2F0ZSwgcm91dGVQYXJhbXMgfSA9IHJlcXVpcmUoXCIuLi91dGlscy5qc1wiKTtcclxuICBjb25zdCB7IGdldFByZWYgfSA9IHJlcXVpcmUoXCIuLi9wcmVmcy5qc1wiKTtcclxuICBjb25zdCB7IG9uRGVzdHJveSwgb25Nb3VudCB9ID0gcmVxdWlyZShcInN2ZWx0ZVwiKTtcclxuXHJcbiAgbGV0IG1zZ3MgPSBbXTtcclxuICBsZXQgdW5zdWI7XHJcblxyXG4gIGRvY3VtZW50LnRpdGxlID0gYFBhdGNoZm94IC0gTWVudGlvbnNgO1xyXG5cclxuICBsZXQgbHQgPSBmYWxzZTtcclxuXHJcbiAgY29uc3QgcHVsbCA9IGhlcm1pZWJveC5tb2R1bGVzLnB1bGxTdHJlYW07XHJcbiAgY29uc3Qgc2JvdCA9IGhlcm1pZWJveC5zYm90O1xyXG5cclxuICBjb25zdCBsb2FkTWVudGlvbnMgPSAoKSA9PiB7XHJcbiAgICBjb25zb2xlLmxvZyhcIkxvYWRpbmcgbWVudGlvbnMuLi5cIiwgbHQpO1xyXG4gICAgd2luZG93LnNjcm9sbFRvKDAsIDApO1xyXG4gICAgbXNncyA9IFtdO1xyXG4gICAgc3NiLm1lbnRpb25zKHNzYi5mZWVkLCBsdCkudGhlbihtcyA9PiAobXNncyA9IG1zKSk7XHJcbiAgfTtcclxuXHJcbiAgb25EZXN0cm95KCgpID0+IHtcclxuICAgIHVuc3ViKCk7XHJcbiAgfSk7XHJcblxyXG4gIG9uTW91bnQoKCkgPT4ge1xyXG4gICAgdW5zdWIgPSByb3V0ZVBhcmFtcy5zdWJzY3JpYmUocGFyYW1zID0+IHtcclxuICAgICAgY29uc29sZS5sb2coXCJwYXJhbXMgY2hhbmdlZC5cIiwgbHQsIHBhcmFtcy5sdCk7XHJcbiAgICAgIGlmIChwYXJhbXMubHQpIHtcclxuICAgICAgICBsZXQgbmV3bHQgPSBwYXJzZUludChwYXJhbXMubHQpO1xyXG4gICAgICAgIGlmIChuZXdsdCAhPT0gbHQpIHtcclxuICAgICAgICAgIGx0ID0gbmV3bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGx0ID0gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgICAgbG9hZE1lbnRpb25zKCk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuPC9zY3JpcHQ+XHJcblxyXG48c3R5bGU+XHJcbiAgLm1lbnUtcmlnaHQge1xyXG4gICAgcmlnaHQ6IDBweDtcclxuICAgIGxlZnQ6IHVuc2V0O1xyXG4gICAgbWluLXdpZHRoOiAzMDBweDtcclxuICB9XHJcbjwvc3R5bGU+XHJcblxyXG48ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgPGRpdiBjbGFzcz1cImNvbHVtbnNcIj5cclxuICAgIDxoNCBjbGFzcz1cImNvbHVtblwiPk1lbnRpb25zPC9oND5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2x1bW5cIiAvPlxyXG4gIDwvZGl2PlxyXG48L2Rpdj5cclxueyNpZiBtc2dzLmxlbmd0aCA9PT0gMH1cclxuICA8ZGl2IGNsYXNzPVwibG9hZGluZyBsb2FkaW5nLWxnXCIgLz5cclxuezplbHNlfVxyXG4gIHsjZWFjaCBtc2dzIGFzIG1zZyAobXNnLmtleSl9XHJcbiAgICA8TWVzc2FnZVJlbmRlcmVyIHttc2d9IC8+XHJcbiAgey9lYWNofVxyXG4gIDx1bCBjbGFzcz1cInBhZ2luYXRpb25cIj5cclxuICAgIDxsaSBjbGFzcz1cInBhZ2UtaXRlbSBwYWdlLXByZXZpb3VzXCI+XHJcbiAgICAgIDxhXHJcbiAgICAgICAgaHJlZj1cIiMvcHVibGljXCJcclxuICAgICAgICBvbjpjbGlja3xzdG9wUHJvcGFnYXRpb258cHJldmVudERlZmF1bHQ9eygpID0+IGhpc3RvcnkuYmFjaygpfT5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicGFnZS1pdGVtLXN1YnRpdGxlXCI+UHJldmlvdXM8L2Rpdj5cclxuICAgICAgPC9hPlxyXG4gICAgPC9saT5cclxuICAgIDxsaSBjbGFzcz1cInBhZ2UtaXRlbSBwYWdlLW5leHRcIj5cclxuICAgICAgPGFcclxuICAgICAgICBocmVmPVwiIy9wdWJsaWNcIlxyXG4gICAgICAgIG9uOmNsaWNrfHN0b3BQcm9wYWdhdGlvbnxwcmV2ZW50RGVmYXVsdD17KCkgPT4ge1xyXG4gICAgICAgICAgbmF2aWdhdGUoJy9tZW50aW9ucycsIHsgbHQ6IG1zZ3NbbXNncy5sZW5ndGggLSAxXS5ydHMgfSk7XHJcbiAgICAgICAgfX0+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInBhZ2UtaXRlbS1zdWJ0aXRsZVwiPk5leHQ8L2Rpdj5cclxuICAgICAgPC9hPlxyXG4gICAgPC9saT5cclxuICA8L3VsPlxyXG57L2lmfVxyXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IiJ9 */";
	append(document_1.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.msg = list[i];
	return child_ctx;
}

// (60:0) {:else}
function create_else_block(ctx) {
	var each_blocks = [], each_1_lookup = new Map(), t0, ul, li0, a0, div0, t2, li1, a1, div1, current, dispose;

	var each_value = ctx.msgs;

	const get_key = ctx => ctx.msg.key;

	for (var i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c: function create() {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();

			t0 = space();
			ul = element("ul");
			li0 = element("li");
			a0 = element("a");
			div0 = element("div");
			div0.textContent = "Previous";
			t2 = space();
			li1 = element("li");
			a1 = element("a");
			div1 = element("div");
			div1.textContent = "Next";
			attr(div0, "class", "page-item-subtitle");
			add_location(div0, file, 68, 8, 1575);
			attr(a0, "href", "#/public");
			add_location(a0, file, 65, 6, 1465);
			attr(li0, "class", "page-item page-previous");
			add_location(li0, file, 64, 4, 1421);
			attr(div1, "class", "page-item-subtitle");
			add_location(div1, file, 77, 8, 1867);
			attr(a1, "href", "#/public");
			add_location(a1, file, 72, 6, 1690);
			attr(li1, "class", "page-item page-next");
			add_location(li1, file, 71, 4, 1650);
			attr(ul, "class", "pagination");
			add_location(ul, file, 63, 2, 1392);

			dispose = [
				listen(a0, "click", stop_propagation(prevent_default(click_handler))),
				listen(a1, "click", stop_propagation(prevent_default(ctx.click_handler_1)))
			];
		},

		m: function mount(target, anchor) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(target, anchor);

			insert(target, t0, anchor);
			insert(target, ul, anchor);
			append(ul, li0);
			append(li0, a0);
			append(a0, div0);
			append(ul, t2);
			append(ul, li1);
			append(li1, a1);
			append(a1, div1);
			current = true;
		},

		p: function update(changed, ctx) {
			const each_value = ctx.msgs;

			group_outros();
			each_blocks = update_keyed_each(each_blocks, changed, get_key, 1, ctx, each_value, each_1_lookup, t0.parentNode, outro_and_destroy_block, create_each_block, t0, get_each_context);
			check_outros();
		},

		i: function intro(local) {
			if (current) return;
			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o: function outro(local) {
			for (i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d: function destroy(detaching) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d(detaching);

			if (detaching) {
				detach(t0);
				detach(ul);
			}

			run_all(dispose);
		}
	};
}

// (58:0) {#if msgs.length === 0}
function create_if_block(ctx) {
	var div;

	return {
		c: function create() {
			div = element("div");
			attr(div, "class", "loading loading-lg");
			add_location(div, file, 58, 2, 1270);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (61:2) {#each msgs as msg (msg.key)}
function create_each_block(key_1, ctx) {
	var first, current;

	var messagerenderer = new ctx.MessageRenderer({
		props: { msg: ctx.msg },
		$$inline: true
	});

	return {
		key: key_1,

		first: null,

		c: function create() {
			first = empty();
			messagerenderer.$$.fragment.c();
			this.first = first;
		},

		m: function mount(target, anchor) {
			insert(target, first, anchor);
			mount_component(messagerenderer, target, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			var messagerenderer_changes = {};
			if (changed.msgs) messagerenderer_changes.msg = ctx.msg;
			messagerenderer.$set(messagerenderer_changes);
		},

		i: function intro(local) {
			if (current) return;
			transition_in(messagerenderer.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(messagerenderer.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(first);
			}

			destroy_component(messagerenderer, detaching);
		}
	};
}

function create_fragment(ctx) {
	var div2, div1, h4, t1, div0, t2, current_block_type_index, if_block, if_block_anchor, current;

	var if_block_creators = [
		create_if_block,
		create_else_block
	];

	var if_blocks = [];

	function select_block_type(ctx) {
		if (ctx.msgs.length === 0) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c: function create() {
			div2 = element("div");
			div1 = element("div");
			h4 = element("h4");
			h4.textContent = "Mentions";
			t1 = space();
			div0 = element("div");
			t2 = space();
			if_block.c();
			if_block_anchor = empty();
			attr(h4, "class", "column");
			add_location(h4, file, 53, 4, 1163);
			attr(div0, "class", "column");
			add_location(div0, file, 54, 4, 1201);
			attr(div1, "class", "columns");
			add_location(div1, file, 52, 2, 1136);
			attr(div2, "class", "container");
			add_location(div2, file, 51, 0, 1109);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div1);
			append(div1, h4);
			append(div1, t1);
			append(div1, div0);
			insert(target, t2, anchor);
			if_blocks[current_block_type_index].m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block = if_blocks[current_block_type_index];
				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				}
				transition_in(if_block, 1);
				if_block.m(if_block_anchor.parentNode, if_block_anchor);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},

		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div2);
				detach(t2);
			}

			if_blocks[current_block_type_index].d(detaching);

			if (detaching) {
				detach(if_block_anchor);
			}
		}
	};
}

function click_handler() {
	return history.back();
}

function instance($$self, $$props, $$invalidate) {
	const MessageRenderer = require("../messageTypes/MessageRenderer.svelte");
  const { navigate, routeParams } = require("../utils.js");
  const { getPref } = require("../prefs.js");
  const { onDestroy, onMount } = require("svelte");

  let msgs = [];
  let unsub;

  document.title = `Patchfox - Mentions`;

  let lt = false;

  const pull = hermiebox.modules.pullStream;
  const sbot = hermiebox.sbot;

  const loadMentions = () => {
    console.log("Loading mentions...", lt);
    window.scrollTo(0, 0);
    $$invalidate('msgs', msgs = []);
    ssb.mentions(ssb.feed, lt).then(ms => { const $$result = (msgs = ms); $$invalidate('msgs', msgs); return $$result; });
  };

  onDestroy(() => {
    unsub();
  });

  onMount(() => {
    unsub = routeParams.subscribe(params => {
      console.log("params changed.", lt, params.lt);
      if (params.lt) {
        let newlt = parseInt(params.lt);
        if (newlt !== lt) {
          lt = newlt;
        }
      } else {
        lt = false;
      }
      loadMentions();
    });
  });

	function click_handler_1() {
	          navigate('/mentions', { lt: msgs[msgs.length - 1].rts });
	        }

	return {
		MessageRenderer,
		navigate,
		msgs,
		click_handler_1
	};
}

class Mentions extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document_1.getElementById("svelte-kdiu44-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Mentions;

},{"../messageTypes/MessageRenderer.svelte":21,"../prefs.js":28,"../utils.js":30,"svelte":7,"svelte/internal":8}],36:[function(require,module,exports){
/* Profile.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	assign,
	attr,
	check_outros,
	component_subscribe,
	destroy_component,
	detach,
	element,
	empty,
	group_outros,
	handle_promise,
	init,
	insert,
	listen,
	mount_component,
	noop,
	outro_and_destroy_block,
	prevent_default,
	run_all,
	safe_not_equal,
	set_data,
	space,
	stop_propagation,
	text,
	transition_in,
	transition_out,
	update_keyed_each,
	validate_store
} = require("svelte/internal");

const file = "Profile.svelte";

function get_each_context(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.msg = list[i];
	return child_ctx;
}

// (175:2) {:catch n}
function create_catch_block_1(ctx) {
	var p, t0, t1_value = ctx.n.message, t1;

	return {
		c: function create() {
			p = element("p");
			t0 = text("Error: ");
			t1 = text(t1_value);
			add_location(p, file, 175, 4, 4405);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, t0);
			append(p, t1);
		},

		p: function update(changed, ctx) {
			if ((changed.aboutPromise || changed.avatarPromise) && t1_value !== (t1_value = ctx.n.message)) {
				set_data(t1, t1_value);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (106:2) {:then}
function create_then_block(ctx) {
	var div3, div1, div0, img, img_src_value, t0, div2, h1, t1, t2, pre, t3, t4, t5, p, raw_value = ctx.ssb.markdown(ctx.description), t6, div4, promise, current;

	var if_block = (ctx.feed !== ctx.ssb.feed) && create_if_block(ctx);

	let info = {
		ctx,
		current: null,
		token: null,
		pending: create_pending_block_1,
		then: create_then_block_1,
		catch: create_catch_block,
		value: 'data',
		error: 'n',
		blocks: [,,,]
	};

	handle_promise(promise = ctx.messagePromise, info);

	return {
		c: function create() {
			div3 = element("div");
			div1 = element("div");
			div0 = element("div");
			img = element("img");
			t0 = space();
			div2 = element("div");
			h1 = element("h1");
			t1 = text(ctx.name);
			t2 = space();
			pre = element("pre");
			t3 = text(ctx.feed);
			t4 = space();
			if (if_block) if_block.c();
			t5 = space();
			p = element("p");
			t6 = space();
			div4 = element("div");

			info.block.c();
			attr(img, "class", "img-responsive");
			attr(img, "src", img_src_value = "http://localhost:8989/blobs/get/" + ctx.image);
			attr(img, "alt", ctx.feed);
			add_location(img, file, 110, 10, 2512);
			attr(div0, "class", "container");
			add_location(div0, file, 109, 8, 2477);
			attr(div1, "class", "column col-6");
			add_location(div1, file, 108, 6, 2441);
			add_location(h1, file, 117, 8, 2712);
			add_location(pre, file, 118, 8, 2737);
			add_location(p, file, 143, 8, 3596);
			attr(div2, "class", "column col-6");
			add_location(div2, file, 116, 6, 2676);
			attr(div3, "class", "columns");
			add_location(div3, file, 106, 4, 2410);
			add_location(div4, file, 149, 4, 3692);
		},

		m: function mount(target, anchor) {
			insert(target, div3, anchor);
			append(div3, div1);
			append(div1, div0);
			append(div0, img);
			append(div3, t0);
			append(div3, div2);
			append(div2, h1);
			append(h1, t1);
			append(div2, t2);
			append(div2, pre);
			append(pre, t3);
			append(div2, t4);
			if (if_block) if_block.m(div2, null);
			append(div2, t5);
			append(div2, p);
			p.innerHTML = raw_value;
			insert(target, t6, anchor);
			insert(target, div4, anchor);

			info.block.m(div4, info.anchor = null);
			info.mount = () => div4;
			info.anchor = null;

			current = true;
		},

		p: function update(changed, new_ctx) {
			ctx = new_ctx;
			if ((!current || changed.image) && img_src_value !== (img_src_value = "http://localhost:8989/blobs/get/" + ctx.image)) {
				attr(img, "src", img_src_value);
			}

			if (!current || changed.feed) {
				attr(img, "alt", ctx.feed);
			}

			if (!current || changed.name) {
				set_data(t1, ctx.name);
			}

			if (!current || changed.feed) {
				set_data(t3, ctx.feed);
			}

			if (ctx.feed !== ctx.ssb.feed) {
				if (if_block) {
					if_block.p(changed, ctx);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					if_block.m(div2, t5);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}

			if ((!current || changed.description) && raw_value !== (raw_value = ctx.ssb.markdown(ctx.description))) {
				p.innerHTML = raw_value;
			}

			info.ctx = ctx;

			if (('messagePromise' in changed) && promise !== (promise = ctx.messagePromise) && handle_promise(promise, info)) {
				// nothing
			} else {
				info.block.p(changed, assign(assign({}, ctx), info.resolved));
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(info.block);
			current = true;
		},

		o: function outro(local) {
			for (let i = 0; i < 3; i += 1) {
				const block = info.blocks[i];
				transition_out(block);
			}

			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div3);
			}

			if (if_block) if_block.d();

			if (detaching) {
				detach(t6);
				detach(div4);
			}

			info.block.d();
			info.token = null;
			info = null;
		}
	};
}

// (120:8) {#if feed !== ssb.feed}
function create_if_block(ctx) {
	var div3, div0, t0, div1, label0, input0, t1, i0, t2, t3, label1, input1, t4, i1, t5, t6, div2, dispose;

	return {
		c: function create() {
			div3 = element("div");
			div0 = element("div");
			t0 = space();
			div1 = element("div");
			label0 = element("label");
			input0 = element("input");
			t1 = space();
			i0 = element("i");
			t2 = text("\r\n                following");
			t3 = space();
			label1 = element("label");
			input1 = element("input");
			t4 = space();
			i1 = element("i");
			t5 = text("\r\n                blocking");
			t6 = space();
			div2 = element("div");
			attr(div0, "class", "divider");
			add_location(div0, file, 121, 12, 2836);
			attr(input0, "type", "checkbox");
			add_location(input0, file, 124, 16, 2970);
			attr(i0, "class", "form-icon");
			add_location(i0, file, 128, 16, 3124);
			attr(label0, "class", "form-switch form-inline");
			add_location(label0, file, 123, 14, 2913);
			attr(input1, "type", "checkbox");
			add_location(input1, file, 132, 16, 3271);
			attr(i1, "class", "form-icon");
			add_location(i1, file, 136, 16, 3423);
			attr(label1, "class", "form-switch form-inline");
			add_location(label1, file, 131, 14, 3214);
			attr(div1, "class", "form-group");
			add_location(div1, file, 122, 12, 2873);
			attr(div2, "class", "divider");
			add_location(div2, file, 140, 12, 3530);
			attr(div3, "class", "container");
			add_location(div3, file, 120, 10, 2799);

			dispose = [
				listen(input0, "change", ctx.input0_change_handler),
				listen(input0, "change", ctx.followingChanged),
				listen(input1, "change", ctx.input1_change_handler),
				listen(input1, "change", ctx.blockingChanged)
			];
		},

		m: function mount(target, anchor) {
			insert(target, div3, anchor);
			append(div3, div0);
			append(div3, t0);
			append(div3, div1);
			append(div1, label0);
			append(label0, input0);

			input0.checked = ctx.following;

			append(label0, t1);
			append(label0, i0);
			append(label0, t2);
			append(div1, t3);
			append(div1, label1);
			append(label1, input1);

			input1.checked = ctx.blocking;

			append(label1, t4);
			append(label1, i1);
			append(label1, t5);
			append(div3, t6);
			append(div3, div2);
		},

		p: function update(changed, ctx) {
			if (changed.following) input0.checked = ctx.following;
			if (changed.blocking) input1.checked = ctx.blocking;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div3);
			}

			run_all(dispose);
		}
	};
}

// (169:6) {:catch n}
function create_catch_block(ctx) {
	var p, t0, t1_value = ctx.n.message, t1;

	return {
		c: function create() {
			p = element("p");
			t0 = text("Error fetching messages: ");
			t1 = text(t1_value);
			add_location(p, file, 169, 8, 4310);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, t0);
			append(p, t1);
		},

		p: function update(changed, ctx) {
			if ((changed.messagePromise) && t1_value !== (t1_value = ctx.n.message)) {
				set_data(t1, t1_value);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (153:6) {:then data}
function create_then_block_1(ctx) {
	var each_blocks = [], each_1_lookup = new Map(), t, ul, li, a, div, current, dispose;

	var each_value = ctx.lastMsgs;

	const get_key = ctx => ctx.msg.key;

	for (var i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c: function create() {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();

			t = space();
			ul = element("ul");
			li = element("li");
			a = element("a");
			div = element("div");
			div.textContent = "Load More";
			attr(div, "class", "page-item-subtitle");
			add_location(div, file, 164, 14, 4185);
			attr(a, "href", "#/public");
			add_location(a, file, 159, 12, 3971);
			attr(li, "class", "page-item page-next");
			add_location(li, file, 158, 10, 3925);
			attr(ul, "class", "pagination");
			add_location(ul, file, 156, 8, 3888);
			dispose = listen(a, "click", stop_propagation(prevent_default(ctx.click_handler)));
		},

		m: function mount(target, anchor) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(target, anchor);

			insert(target, t, anchor);
			insert(target, ul, anchor);
			append(ul, li);
			append(li, a);
			append(a, div);
			current = true;
		},

		p: function update(changed, ctx) {
			const each_value = ctx.lastMsgs;

			group_outros();
			each_blocks = update_keyed_each(each_blocks, changed, get_key, 1, ctx, each_value, each_1_lookup, t.parentNode, outro_and_destroy_block, create_each_block, t, get_each_context);
			check_outros();
		},

		i: function intro(local) {
			if (current) return;
			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o: function outro(local) {
			for (i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d: function destroy(detaching) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d(detaching);

			if (detaching) {
				detach(t);
				detach(ul);
			}

			dispose();
		}
	};
}

// (154:8) {#each lastMsgs as msg (msg.key)}
function create_each_block(key_1, ctx) {
	var first, current;

	var messagerenderer = new ctx.MessageRenderer({
		props: { msg: ctx.msg },
		$$inline: true
	});

	return {
		key: key_1,

		first: null,

		c: function create() {
			first = empty();
			messagerenderer.$$.fragment.c();
			this.first = first;
		},

		m: function mount(target, anchor) {
			insert(target, first, anchor);
			mount_component(messagerenderer, target, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			var messagerenderer_changes = {};
			if (changed.lastMsgs) messagerenderer_changes.msg = ctx.msg;
			messagerenderer.$set(messagerenderer_changes);
		},

		i: function intro(local) {
			if (current) return;
			transition_in(messagerenderer.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(messagerenderer.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(first);
			}

			destroy_component(messagerenderer, detaching);
		}
	};
}

// (151:29)           <div class="loading" />        {:then data}
function create_pending_block_1(ctx) {
	var div;

	return {
		c: function create() {
			div = element("div");
			attr(div, "class", "loading");
			add_location(div, file, 151, 8, 3738);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (104:40)       <div class="loading loading-lg" />    {:then}
function create_pending_block(ctx) {
	var div;

	return {
		c: function create() {
			div = element("div");
			attr(div, "class", "loading loading-lg");
			add_location(div, file, 104, 4, 2359);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

function create_fragment(ctx) {
	var div, promise, current;

	let info = {
		ctx,
		current: null,
		token: null,
		pending: create_pending_block,
		then: create_then_block,
		catch: create_catch_block_1,
		value: 'null',
		error: 'n',
		blocks: [,,,]
	};

	handle_promise(promise = ctx.aboutPromise && ctx.avatarPromise, info);

	return {
		c: function create() {
			div = element("div");

			info.block.c();
			attr(div, "class", "container");
			add_location(div, file, 102, 0, 2288);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);

			info.block.m(div, info.anchor = null);
			info.mount = () => div;
			info.anchor = null;

			current = true;
		},

		p: function update(changed, new_ctx) {
			ctx = new_ctx;
			info.ctx = ctx;

			if (('aboutPromise' in changed || 'avatarPromise' in changed) && promise !== (promise = ctx.aboutPromise && ctx.avatarPromise) && handle_promise(promise, info)) {
				// nothing
			} else {
				info.block.p(changed, assign(assign({}, ctx), info.resolved));
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(info.block);
			current = true;
		},

		o: function outro(local) {
			for (let i = 0; i < 3; i += 1) {
				const block = info.blocks[i];
				transition_out(block);
			}

			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			info.block.d();
			info.token = null;
			info = null;
		}
	};
}

let profile = false;

function instance($$self, $$props, $$invalidate) {
	let $routeParams;

	const MessageRenderer =  require("../messageTypes/MessageRenderer.svelte");
  const { navigate, routeParams } = require( "../utils.js"); validate_store(routeParams, 'routeParams'); component_subscribe($$self, routeParams, $$value => { $routeParams = $$value; $$invalidate('$routeParams', $routeParams) });

  let description = false;
  let following = false;
  let blocking = false;
  let image;
  let feed;
  let lastMsgs = [];
  let lastAbout;
  let avatarPromise;
  let messagePromise;
  let aboutPromise;

  $$invalidate('feed', feed = $routeParams.feed);

  if (!feed) {
    $$invalidate('feed', feed = ssb.feed);
  }

  let name = feed;

  document.title = `Patchfox - Feed: ${feed}`;

  console.log("fetching", feed);

  $$invalidate('avatarPromise', avatarPromise = ssb.avatar(feed).then(data => {
    $$invalidate('name', name = data.name);
    $$invalidate('image', image = data.image);
    document.title = `Patchfox - Feed: ${name}`;
  }));

  $$invalidate('aboutPromise', aboutPromise = ssb.profile(feed).then(data => {
    lastAbout = data.about.reverse().find(m => {
      let a = m.value.content;
      return a.hasOwnProperty("description");
    });
    try {
      $$invalidate('description', description = lastAbout.value.content.description);
    } catch (n) {
      $$invalidate('description', description = "");
    }
    window.scrollTo(0, 0);
  }));

  $$invalidate('messagePromise', messagePromise = ssb
    .query(
      {
        value: {
          author: feed
        }
      },
      10
    )
    .then(msgs => {
      $$invalidate('lastMsgs', lastMsgs = msgs);

      window.scrollTo(0, 0);
    }));

  if (feed !== ssb.feed) {
    ssb.following(feed).then(f => { const $$result = (following = f); $$invalidate('following', following); return $$result; });
    ssb.blocking(feed).then(f => { const $$result = (blocking = f); $$invalidate('blocking', blocking); return $$result; });
  }

  const blockingChanged = ev => {
    let v = ev.target.checked;
    if (v) {
      ssb.block(feed).catch(() => { const $$result = (blocking = false); $$invalidate('blocking', blocking); return $$result; });
    } else {
      ssb.unblock(feed).catch(() => { const $$result = (blocking = true); $$invalidate('blocking', blocking); return $$result; });
    }
  };

  const followingChanged = ev => {
    let v = ev.target.checked;
    if (v) {
      ssb.follow(feed).catch(() => { const $$result = (following = false); $$invalidate('following', following); return $$result; });
    } else {
      ssb.unfollow(feed).catch(() => { const $$result = (following = true); $$invalidate('following', following); return $$result; });
    }
  };

  // todo: refactor navigation here. This is a hack it shouldn't hide and show values which are
  // not reloading.
  const loadMoreMessages = lt => {
    $$invalidate('messagePromise', messagePromise = ssb
      .query({
        value: {
          author: feed,
          timestamp: { $lt: lt }
        }
      })
      .then(msgs => {
        $$invalidate('lastMsgs', lastMsgs = msgs);
        window.scrollTo(0, 0);
      }));
  };

	function input0_change_handler() {
		following = this.checked;
		$$invalidate('following', following);
	}

	function input1_change_handler() {
		blocking = this.checked;
		$$invalidate('blocking', blocking);
	}

	function click_handler() {
	                loadMoreMessages(lastMsgs[lastMsgs.length - 1].value.timestamp);
	              }

	return {
		MessageRenderer,
		routeParams,
		description,
		following,
		blocking,
		image,
		feed,
		lastMsgs,
		avatarPromise,
		messagePromise,
		aboutPromise,
		name,
		blockingChanged,
		followingChanged,
		loadMoreMessages,
		ssb,
		input0_change_handler,
		input1_change_handler,
		click_handler
	};
}

class Profile extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Profile;

},{"../messageTypes/MessageRenderer.svelte":21,"../utils.js":30,"svelte/internal":8}],37:[function(require,module,exports){
/* Public.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	check_outros,
	component_subscribe,
	destroy_component,
	detach,
	element,
	empty,
	globals,
	group_outros,
	init,
	insert,
	listen,
	mount_component,
	noop,
	outro_and_destroy_block,
	prevent_default,
	run_all,
	safe_not_equal,
	space,
	stop_propagation,
	text,
	transition_in,
	transition_out,
	update_keyed_each,
	validate_store
} = require("svelte/internal");

const { Object: Object_1, document: document_1 } = globals;

const file = "Public.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-kdiu44-style';
	style.textContent = "\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHVibGljLnN2ZWx0ZSIsInNvdXJjZXMiOlsiUHVibGljLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxyXG4gIGNvbnN0IE1lc3NhZ2VSZW5kZXJlciA9IHJlcXVpcmUoXCIuLi9tZXNzYWdlVHlwZXMvTWVzc2FnZVJlbmRlcmVyLnN2ZWx0ZVwiKTtcclxuICBjb25zdCB7IG5hdmlnYXRlLCByb3V0ZVBhcmFtcyB9ID0gcmVxdWlyZShcIi4uL3V0aWxzLmpzXCIpO1xyXG4gIGNvbnN0IHsgZ2V0UHJlZnMgfSA9IHJlcXVpcmUoXCIuLi9wcmVmcy5qc1wiKTtcclxuICBjb25zdCB7IG9uTW91bnQgfSA9IHJlcXVpcmUoXCJzdmVsdGVcIik7XHJcblxyXG4gIGxldCBtc2dzID0gZmFsc2U7XHJcbiAgbGV0IGVycm9yID0gJHJvdXRlUGFyYW1zLmVycm9yIHx8IGZhbHNlO1xyXG4gIGxldCBkcm9wZG93bkFjdGl2ZSA9IGZhbHNlO1xyXG5cclxuICBsZXQgb3B0cyA9IHt9O1xyXG5cclxuICAvLyB0b2RvOiBtb3ZlIGJhY2sgaW50byB1c2luZyBzdG9yZXMuXHJcbiAgJDoge1xyXG4gICAgT2JqZWN0LmFzc2lnbihvcHRzLCAkcm91dGVQYXJhbXMpO1xyXG5cclxuICAgIGRvY3VtZW50LnRpdGxlID0gYFBhdGNoZm94IC0gUHVibGljYDtcclxuXHJcbiAgICBpZiAob3B0cy5oYXNPd25Qcm9wZXJ0eShcImx0XCIpKSB7XHJcbiAgICAgIG9wdHMubHQgPSBwYXJzZUludChvcHRzLmx0KTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAob3B0cy5oYXNPd25Qcm9wZXJ0eShcImxpbWl0XCIpKSB7XHJcbiAgICAgIG9wdHMubGltaXQgPSBwYXJzZUludChvcHRzLmxpbWl0KTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgcHJvbWlzZSA9IHNzYlxyXG4gICAgICAucHVibGljKG9wdHMpXHJcbiAgICAgIC50aGVuKG1zID0+IHtcclxuICAgICAgICBtc2dzID0gbXM7XHJcbiAgICAgICAgd2luZG93LnNjcm9sbFRvKDAsIDApO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2gobiA9PiB7XHJcbiAgICAgICAgaWYgKCFlcnJvcikge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcihcImVycnJyb29vb29yXCIsIG4pO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBnb05leHQgPSAoKSA9PiB7XHJcbiAgICBsZXQgbHQgPSBtc2dzW21zZ3MubGVuZ3RoIC0gMV0udmFsdWUudGltZXN0YW1wO1xyXG4gICAgbXNncyA9IGZhbHNlO1xyXG4gICAgbmF2aWdhdGUoXCIvcHVibGljXCIsIHtcclxuICAgICAgbHRcclxuICAgIH0pO1xyXG4gIH07XHJcbiAgY29uc3QgZ29QcmV2aW91cyA9ICgpID0+IHtcclxuICAgIG1zZ3MgPSBmYWxzZTtcclxuICAgIGhpc3RvcnkuYmFjaygpO1xyXG4gIH07XHJcbjwvc2NyaXB0PlxyXG5cclxuPHN0eWxlPlxyXG4gIC5tZW51LXJpZ2h0IHtcclxuICAgIHJpZ2h0OiAwcHg7XHJcbiAgICBsZWZ0OiB1bnNldDtcclxuICAgIG1pbi13aWR0aDogMzAwcHg7XHJcbiAgfVxyXG48L3N0eWxlPlxyXG5cclxuPGRpdiBjbGFzcz1cImNvbnRhaW5lclwiPlxyXG4gIDxkaXYgY2xhc3M9XCJjb2x1bW5zXCI+XHJcbiAgICA8aDQgY2xhc3M9XCJjb2x1bW5cIj5QdWJsaWMgRmVlZDwvaDQ+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29sdW1uXCIgLz5cclxuICA8L2Rpdj5cclxuPC9kaXY+XHJcbnsjaWYgZXJyb3J9XHJcbiAgPGRpdiBjbGFzcz1cInRvYXN0IHRvYXN0LWVycm9yXCI+RXJyb3I6IHtlcnJvcn08L2Rpdj5cclxuey9pZn1cclxueyNpZiAhbXNnc31cclxuICA8ZGl2IGNsYXNzPVwibG9hZGluZyBsb2FkaW5nLWxnXCIgLz5cclxuezplbHNlfVxyXG4gIHsjZWFjaCBtc2dzIGFzIG1zZyAobXNnLmtleSl9XHJcbiAgICA8TWVzc2FnZVJlbmRlcmVyIHttc2d9IC8+XHJcbiAgey9lYWNofVxyXG4gIDx1bCBjbGFzcz1cInBhZ2luYXRpb25cIj5cclxuICAgIDxsaSBjbGFzcz1cInBhZ2UtaXRlbSBwYWdlLXByZXZpb3VzXCI+XHJcbiAgICAgIDxhIGhyZWY9XCIjL3B1YmxpY1wiIG9uOmNsaWNrfHN0b3BQcm9wYWdhdGlvbnxwcmV2ZW50RGVmYXVsdD17Z29QcmV2aW91c30+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInBhZ2UtaXRlbS1zdWJ0aXRsZVwiPlByZXZpb3VzPC9kaXY+XHJcbiAgICAgIDwvYT5cclxuICAgIDwvbGk+XHJcbiAgICA8bGkgY2xhc3M9XCJwYWdlLWl0ZW0gcGFnZS1uZXh0XCI+XHJcbiAgICAgIDxhIGhyZWY9XCIjL3B1YmxpY1wiIG9uOmNsaWNrfHN0b3BQcm9wYWdhdGlvbnxwcmV2ZW50RGVmYXVsdD17Z29OZXh0fT5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicGFnZS1pdGVtLXN1YnRpdGxlXCI+TmV4dDwvZGl2PlxyXG4gICAgICA8L2E+XHJcbiAgICA8L2xpPlxyXG4gIDwvdWw+XHJcbnsvaWZ9XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiIn0= */";
	append(document_1.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = Object_1.create(ctx);
	child_ctx.msg = list[i];
	return child_ctx;
}

// (67:0) {#if error}
function create_if_block_1(ctx) {
	var div, t0, t1;

	return {
		c: function create() {
			div = element("div");
			t0 = text("Error: ");
			t1 = text(ctx.error);
			attr(div, "class", "toast toast-error");
			add_location(div, file, 67, 2, 1406);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
		},

		p: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (72:0) {:else}
function create_else_block(ctx) {
	var each_blocks = [], each_1_lookup = new Map(), t0, ul, li0, a0, div0, t2, li1, a1, div1, current, dispose;

	var each_value = ctx.msgs;

	const get_key = ctx => ctx.msg.key;

	for (var i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c: function create() {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();

			t0 = space();
			ul = element("ul");
			li0 = element("li");
			a0 = element("a");
			div0 = element("div");
			div0.textContent = "Previous";
			t2 = space();
			li1 = element("li");
			a1 = element("a");
			div1 = element("div");
			div1.textContent = "Next";
			attr(div0, "class", "page-item-subtitle");
			add_location(div0, file, 78, 8, 1758);
			attr(a0, "href", "#/public");
			add_location(a0, file, 77, 6, 1676);
			attr(li0, "class", "page-item page-previous");
			add_location(li0, file, 76, 4, 1632);
			attr(div1, "class", "page-item-subtitle");
			add_location(div1, file, 83, 8, 1951);
			attr(a1, "href", "#/public");
			add_location(a1, file, 82, 6, 1873);
			attr(li1, "class", "page-item page-next");
			add_location(li1, file, 81, 4, 1833);
			attr(ul, "class", "pagination");
			add_location(ul, file, 75, 2, 1603);

			dispose = [
				listen(a0, "click", stop_propagation(prevent_default(ctx.goPrevious))),
				listen(a1, "click", stop_propagation(prevent_default(ctx.goNext)))
			];
		},

		m: function mount(target, anchor) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(target, anchor);

			insert(target, t0, anchor);
			insert(target, ul, anchor);
			append(ul, li0);
			append(li0, a0);
			append(a0, div0);
			append(ul, t2);
			append(ul, li1);
			append(li1, a1);
			append(a1, div1);
			current = true;
		},

		p: function update(changed, ctx) {
			const each_value = ctx.msgs;

			group_outros();
			each_blocks = update_keyed_each(each_blocks, changed, get_key, 1, ctx, each_value, each_1_lookup, t0.parentNode, outro_and_destroy_block, create_each_block, t0, get_each_context);
			check_outros();
		},

		i: function intro(local) {
			if (current) return;
			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o: function outro(local) {
			for (i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d: function destroy(detaching) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d(detaching);

			if (detaching) {
				detach(t0);
				detach(ul);
			}

			run_all(dispose);
		}
	};
}

// (70:0) {#if !msgs}
function create_if_block(ctx) {
	var div;

	return {
		c: function create() {
			div = element("div");
			attr(div, "class", "loading loading-lg");
			add_location(div, file, 70, 2, 1481);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (73:2) {#each msgs as msg (msg.key)}
function create_each_block(key_1, ctx) {
	var first, current;

	var messagerenderer = new ctx.MessageRenderer({
		props: { msg: ctx.msg },
		$$inline: true
	});

	return {
		key: key_1,

		first: null,

		c: function create() {
			first = empty();
			messagerenderer.$$.fragment.c();
			this.first = first;
		},

		m: function mount(target, anchor) {
			insert(target, first, anchor);
			mount_component(messagerenderer, target, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			var messagerenderer_changes = {};
			if (changed.msgs) messagerenderer_changes.msg = ctx.msg;
			messagerenderer.$set(messagerenderer_changes);
		},

		i: function intro(local) {
			if (current) return;
			transition_in(messagerenderer.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(messagerenderer.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(first);
			}

			destroy_component(messagerenderer, detaching);
		}
	};
}

function create_fragment(ctx) {
	var div2, div1, h4, t1, div0, t2, t3, current_block_type_index, if_block1, if_block1_anchor, current;

	var if_block0 = (ctx.error) && create_if_block_1(ctx);

	var if_block_creators = [
		create_if_block,
		create_else_block
	];

	var if_blocks = [];

	function select_block_type(ctx) {
		if (!ctx.msgs) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c: function create() {
			div2 = element("div");
			div1 = element("div");
			h4 = element("h4");
			h4.textContent = "Public Feed";
			t1 = space();
			div0 = element("div");
			t2 = space();
			if (if_block0) if_block0.c();
			t3 = space();
			if_block1.c();
			if_block1_anchor = empty();
			attr(h4, "class", "column");
			add_location(h4, file, 62, 4, 1308);
			attr(div0, "class", "column");
			add_location(div0, file, 63, 4, 1349);
			attr(div1, "class", "columns");
			add_location(div1, file, 61, 2, 1281);
			attr(div2, "class", "container");
			add_location(div2, file, 60, 0, 1254);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div1);
			append(div1, h4);
			append(div1, t1);
			append(div1, div0);
			insert(target, t2, anchor);
			if (if_block0) if_block0.m(target, anchor);
			insert(target, t3, anchor);
			if_blocks[current_block_type_index].m(target, anchor);
			insert(target, if_block1_anchor, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			if (ctx.error) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(t3.parentNode, t3);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block1 = if_blocks[current_block_type_index];
				if (!if_block1) {
					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block1.c();
				}
				transition_in(if_block1, 1);
				if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(if_block1);
			current = true;
		},

		o: function outro(local) {
			transition_out(if_block1);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div2);
				detach(t2);
			}

			if (if_block0) if_block0.d(detaching);

			if (detaching) {
				detach(t3);
			}

			if_blocks[current_block_type_index].d(detaching);

			if (detaching) {
				detach(if_block1_anchor);
			}
		}
	};
}

let dropdownActive = false;

function instance($$self, $$props, $$invalidate) {
	let $routeParams;

	const MessageRenderer = require("../messageTypes/MessageRenderer.svelte");
  const { navigate, routeParams } = require("../utils.js"); validate_store(routeParams, 'routeParams'); component_subscribe($$self, routeParams, $$value => { $routeParams = $$value; $$invalidate('$routeParams', $routeParams) });
  const { getPrefs } = require("../prefs.js");
  const { onMount } = require("svelte");

  let msgs = false;
  let error = $routeParams.error || false;

  let opts = {};

  const goNext = () => {
    let lt = msgs[msgs.length - 1].value.timestamp;
    $$invalidate('msgs', msgs = false);
    navigate("/public", {
      lt
    });
  };
  const goPrevious = () => {
    $$invalidate('msgs', msgs = false);
    history.back();
  };

	$$self.$$.update = ($$dirty = { opts: 1, $routeParams: 1, error: 1 }) => {
		if ($$dirty.opts || $$dirty.$routeParams || $$dirty.error) { {
        Object.assign(opts, $routeParams);
    
        document.title = `Patchfox - Public`;
    
        if (opts.hasOwnProperty("lt")) {
          opts.lt = parseInt(opts.lt); $$invalidate('opts', opts), $$invalidate('$routeParams', $routeParams), $$invalidate('error', error);
        }
    
        if (opts.hasOwnProperty("limit")) {
          opts.limit = parseInt(opts.limit); $$invalidate('opts', opts), $$invalidate('$routeParams', $routeParams), $$invalidate('error', error);
        }
    
        let promise = ssb
          .public(opts)
          .then(ms => {
            $$invalidate('msgs', msgs = ms);
            window.scrollTo(0, 0);
          })
          .catch(n => {
            if (!error) {
              console.error("errrrooooor", n);
            }
          });
      } }
	};

	return {
		MessageRenderer,
		routeParams,
		msgs,
		error,
		goNext,
		goPrevious
	};
}

class Public extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document_1.getElementById("svelte-kdiu44-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Public;

},{"../messageTypes/MessageRenderer.svelte":21,"../prefs.js":28,"../utils.js":30,"svelte":7,"svelte/internal":8}],38:[function(require,module,exports){
/* Search.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	check_outros,
	component_subscribe,
	destroy_component,
	detach,
	element,
	empty,
	group_outros,
	init,
	insert,
	mount_component,
	outro_and_destroy_block,
	safe_not_equal,
	set_data,
	space,
	text,
	transition_in,
	transition_out,
	update_keyed_each,
	validate_store
} = require("svelte/internal");

const file = "Search.svelte";

function get_each_context(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.msg = list[i];
	return child_ctx;
}

// (45:0) {#if error}
function create_if_block_1(ctx) {
	var div, t0, t1, t2, t3;

	return {
		c: function create() {
			div = element("div");
			t0 = text("Couldn't find results for query ");
			t1 = text(ctx.query);
			t2 = text(" : ");
			t3 = text(ctx.error);
			attr(div, "class", "toast toast-error");
			add_location(div, file, 45, 2, 1010);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
			append(div, t2);
			append(div, t3);
		},

		p: function update(changed, ctx) {
			if (changed.query) {
				set_data(t1, ctx.query);
			}

			if (changed.error) {
				set_data(t3, ctx.error);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (50:0) {#if loading}
function create_if_block(ctx) {
	var div;

	return {
		c: function create() {
			div = element("div");
			attr(div, "class", "loading loading-lg");
			add_location(div, file, 50, 2, 1132);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (53:0) {#each msgs as msg (msg.key)}
function create_each_block(key_1, ctx) {
	var first, current;

	var messagerenderer = new ctx.MessageRenderer({
		props: { msg: ctx.msg },
		$$inline: true
	});

	return {
		key: key_1,

		first: null,

		c: function create() {
			first = empty();
			messagerenderer.$$.fragment.c();
			this.first = first;
		},

		m: function mount(target, anchor) {
			insert(target, first, anchor);
			mount_component(messagerenderer, target, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			var messagerenderer_changes = {};
			if (changed.msgs) messagerenderer_changes.msg = ctx.msg;
			messagerenderer.$set(messagerenderer_changes);
		},

		i: function intro(local) {
			if (current) return;
			transition_in(messagerenderer.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(messagerenderer.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(first);
			}

			destroy_component(messagerenderer, detaching);
		}
	};
}

function create_fragment(ctx) {
	var div, h4, t0, small, t1, t2, t3, t4, each_blocks = [], each_1_lookup = new Map(), each_1_anchor, current;

	var if_block0 = (ctx.error) && create_if_block_1(ctx);

	var if_block1 = (ctx.loading) && create_if_block(ctx);

	var each_value = ctx.msgs;

	const get_key = ctx => ctx.msg.key;

	for (var i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c: function create() {
			div = element("div");
			h4 = element("h4");
			t0 = text("Search\r\n    ");
			small = element("small");
			t1 = text(ctx.query);
			t2 = space();
			if (if_block0) if_block0.c();
			t3 = space();
			if (if_block1) if_block1.c();
			t4 = space();

			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();

			each_1_anchor = empty();
			attr(small, "class", "label hide-sm");
			add_location(small, file, 41, 4, 932);
			add_location(h4, file, 39, 2, 910);
			attr(div, "class", "container");
			add_location(div, file, 38, 0, 883);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, h4);
			append(h4, t0);
			append(h4, small);
			append(small, t1);
			insert(target, t2, anchor);
			if (if_block0) if_block0.m(target, anchor);
			insert(target, t3, anchor);
			if (if_block1) if_block1.m(target, anchor);
			insert(target, t4, anchor);

			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(target, anchor);

			insert(target, each_1_anchor, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			if (!current || changed.query) {
				set_data(t1, ctx.query);
			}

			if (ctx.error) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(t3.parentNode, t3);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.loading) {
				if (!if_block1) {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					if_block1.m(t4.parentNode, t4);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			const each_value = ctx.msgs;

			group_outros();
			each_blocks = update_keyed_each(each_blocks, changed, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block, each_1_anchor, get_each_context);
			check_outros();
		},

		i: function intro(local) {
			if (current) return;
			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o: function outro(local) {
			for (i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
				detach(t2);
			}

			if (if_block0) if_block0.d(detaching);

			if (detaching) {
				detach(t3);
			}

			if (if_block1) if_block1.d(detaching);

			if (detaching) {
				detach(t4);
			}

			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d(detaching);

			if (detaching) {
				detach(each_1_anchor);
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $routeParams;

	const { tick } = require("svelte");
  const MessageRenderer = require("../messageTypes/MessageRenderer.svelte");
  const { navigate, routeParams } = require("../utils.js"); validate_store(routeParams, 'routeParams'); component_subscribe($$self, routeParams, $$value => { $routeParams = $$value; $$invalidate('$routeParams', $routeParams) });
  let msgs = [];
  let loading = true;
  let error = false;
  let query;

	$$self.$$.update = ($$dirty = { query: 1, $routeParams: 1, msgs: 1 }) => {
		if ($$dirty.query || $$dirty.$routeParams || $$dirty.msgs) { {
        if (query !== $routeParams.query) {
          $$invalidate('query', query = $routeParams.query);
          $$invalidate('msgs', msgs = []);
          $$invalidate('loading', loading = true);
          console.log("New search", query);
        }
    
        document.title = `Patchfox - search: ${query}`;
    
        const gotResult = async msg => {
          await tick();
          console.log("got a match", msg);
          msgs.push(msg);
        };
    
        let promise = ssb
          .searchWithCallback(query, gotResult)
          .then(() => {
            $$invalidate('loading', loading = false);
          })
          .catch(n => {
            console.dir(n);
            $$invalidate('error', error = n.message);
            $$invalidate('loading', loading = false);
          });
      } }
	};

	return {
		MessageRenderer,
		routeParams,
		msgs,
		loading,
		error,
		query
	};
}

class Search extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Search;

},{"../messageTypes/MessageRenderer.svelte":21,"../utils.js":30,"svelte":7,"svelte/internal":8}],39:[function(require,module,exports){
/* ContentWarnings.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	run_all,
	safe_not_equal,
	space,
	text
} = require("svelte/internal");

const file = "ContentWarnings.svelte";

function create_fragment(ctx) {
	var h1, t1, form, label0, t3, label1, input0, t4, i0, t5, t6, label2, input1, t7, i1, t8, dispose;

	return {
		c: function create() {
			h1 = element("h1");
			h1.textContent = "Content Warnings";
			t1 = space();
			form = element("form");
			label0 = element("label");
			label0.textContent = "Should Content Warnings by collapsed or expanded by default?";
			t3 = space();
			label1 = element("label");
			input0 = element("input");
			t4 = space();
			i0 = element("i");
			t5 = text("\r\n    Collapsed");
			t6 = space();
			label2 = element("label");
			input1 = element("input");
			t7 = space();
			i1 = element("i");
			t8 = text("\r\n    Expanded");
			attr(h1, "class", "title");
			add_location(h1, file, 5, 0, 156);
			attr(label0, "class", "form-label");
			add_location(label0, file, 7, 2, 226);
			ctx.$$binding_groups[0].push(input0);
			attr(input0, "type", "radio");
			attr(input0, "name", "column-size");
			input0.__value = "collapsed";
			input0.value = input0.__value;
			add_location(input0, file, 11, 4, 366);
			attr(i0, "class", "form-icon");
			add_location(i0, file, 17, 4, 565);
			attr(label1, "class", "form-radio");
			add_location(label1, file, 10, 2, 334);
			ctx.$$binding_groups[0].push(input1);
			attr(input1, "type", "radio");
			attr(input1, "name", "column-size");
			input1.__value = "expanded";
			input1.value = input1.__value;
			add_location(input1, file, 21, 4, 651);
			attr(i1, "class", "form-icon");
			add_location(i1, file, 27, 4, 849);
			attr(label2, "class", "form-radio");
			add_location(label2, file, 20, 2, 619);
			attr(form, "class", "form-group");
			add_location(form, file, 6, 0, 197);

			dispose = [
				listen(input0, "change", ctx.input0_change_handler),
				listen(input0, "change", ctx.change_handler),
				listen(input1, "change", ctx.input1_change_handler),
				listen(input1, "change", ctx.change_handler_1)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, h1, anchor);
			insert(target, t1, anchor);
			insert(target, form, anchor);
			append(form, label0);
			append(form, t3);
			append(form, label1);
			append(label1, input0);

			input0.checked = input0.__value === ctx.expandByDefault;

			append(label1, t4);
			append(label1, i0);
			append(label1, t5);
			append(form, t6);
			append(form, label2);
			append(label2, input1);

			input1.checked = input1.__value === ctx.expandByDefault;

			append(label2, t7);
			append(label2, i1);
			append(label2, t8);
		},

		p: function update(changed, ctx) {
			if (changed.expandByDefault) input0.checked = input0.__value === ctx.expandByDefault;
			if (changed.expandByDefault) input1.checked = input1.__value === ctx.expandByDefault;
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h1);
				detach(t1);
				detach(form);
			}

			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input0), 1);
			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input1), 1);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { getPref, setPref } = require("../../prefs.js");
  let expandByDefault = getPref("content-warnings-expand", "collapsed");

	const $$binding_groups = [[]];

	function input0_change_handler() {
		expandByDefault = this.__value;
		$$invalidate('expandByDefault', expandByDefault);
	}

	function change_handler() {
		return setPref('content-warnings-expand', expandByDefault);
	}

	function input1_change_handler() {
		expandByDefault = this.__value;
		$$invalidate('expandByDefault', expandByDefault);
	}

	function change_handler_1() {
		return setPref('content-warnings-expand', expandByDefault);
	}

	return {
		setPref,
		expandByDefault,
		input0_change_handler,
		change_handler,
		input1_change_handler,
		change_handler_1,
		$$binding_groups
	};
}

class ContentWarnings extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = ContentWarnings;

},{"../../prefs.js":28,"svelte/internal":8}],40:[function(require,module,exports){
/* DisplayPreferences.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	run_all,
	safe_not_equal,
	space,
	text,
	to_number
} = require("svelte/internal");

const file = "DisplayPreferences.svelte";

function create_fragment(ctx) {
	var h1, t1, form, label0, t3, label1, input0, t4, i0, t5, t6, label2, input1, t7, i1, t8, t9, label3, t11, input2, t12, br0, t13, span, t14, a, t15, i2, t17, label4, input3, t18, i3, t19, b0, t21, t22, label5, input4, t23, i4, t24, b1, t26, t27, label6, input5, t28, i5, t29, b2, t31, t32, label7, input6, t33, i6, t34, b3, t36, t37, label8, input7, t38, i7, t39, b4, t41, t42, label9, input8, t43, i8, t44, b5, t46, t47, label10, input9, t48, i9, t49, b6, t51, t52, label11, input10, t53, i10, t54, b7, t56, t57, div, t58, label12, input11, t59, i11, t60, b8, t62, t63, br1, dispose;

	return {
		c: function create() {
			h1 = element("h1");
			h1.textContent = "Display Preferences";
			t1 = space();
			form = element("form");
			label0 = element("label");
			label0.textContent = "Feed column size. There is research that says that a short column size makes\r\n    for a more pleasant reading experience, still some users prefer to use the\r\n    full screen space. Your choice is between reading through long text lines or\r\n    short ones.";
			t3 = space();
			label1 = element("label");
			input0 = element("input");
			t4 = space();
			i0 = element("i");
			t5 = text("\r\n    Short column");
			t6 = space();
			label2 = element("label");
			input1 = element("input");
			t7 = space();
			i1 = element("i");
			t8 = text("\r\n    Long column");
			t9 = space();
			label3 = element("label");
			label3.textContent = "Messages per page";
			t11 = space();
			input2 = element("input");
			t12 = space();
			br0 = element("br");
			t13 = space();
			span = element("span");
			t14 = text("Which message types you want to see?\r\n    ");
			a = element("a");
			t15 = text("Click here for more information about\r\n      ");
			i2 = element("i");
			i2.textContent = "Message Types";
			t17 = space();
			label4 = element("label");
			input3 = element("input");
			t18 = space();
			i3 = element("i");
			t19 = space();
			b0 = element("b");
			b0.textContent = "About";
			t21 = text("\r\n    (aka people setting avatars and descriptions; gatherings)");
			t22 = space();
			label5 = element("label");
			input4 = element("input");
			t23 = space();
			i4 = element("i");
			t24 = space();
			b1 = element("b");
			b1.textContent = "Blog";
			t26 = text("\r\n    (Longform text posts)");
			t27 = space();
			label6 = element("label");
			input5 = element("input");
			t28 = space();
			i5 = element("i");
			t29 = space();
			b2 = element("b");
			b2.textContent = "Channel";
			t31 = text("\r\n    (People subscribing to channels)");
			t32 = space();
			label7 = element("label");
			input6 = element("input");
			t33 = space();
			i6 = element("i");
			t34 = space();
			b3 = element("b");
			b3.textContent = "Contact";
			t36 = text("\r\n    (People following each other)");
			t37 = space();
			label8 = element("label");
			input7 = element("input");
			t38 = space();
			i7 = element("i");
			t39 = space();
			b4 = element("b");
			b4.textContent = "Posts";
			t41 = text("\r\n    (Common content post, leave this on or it is not that fun)");
			t42 = space();
			label9 = element("label");
			input8 = element("input");
			t43 = space();
			i8 = element("i");
			t44 = space();
			b5 = element("b");
			b5.textContent = "Pub";
			t46 = text("\r\n    (Pub servers announcements)");
			t47 = space();
			label10 = element("label");
			input9 = element("input");
			t48 = space();
			i9 = element("i");
			t49 = space();
			b6 = element("b");
			b6.textContent = "Private";
			t51 = text("\r\n    (Private messages; You won't be able to read them, but you'll see their\r\n    encrypted content passing by)");
			t52 = space();
			label11 = element("label");
			input10 = element("input");
			t53 = space();
			i10 = element("i");
			t54 = space();
			b7 = element("b");
			b7.textContent = "Vote";
			t56 = text("\r\n    (People liking/digging stuff)");
			t57 = space();
			div = element("div");
			t58 = space();
			label12 = element("label");
			input11 = element("input");
			t59 = space();
			i11 = element("i");
			t60 = space();
			b8 = element("b");
			b8.textContent = "Unknown";
			t62 = text("\r\n    (Show messages Patchfox doesn't understand as their raw content)");
			t63 = space();
			br1 = element("br");
			attr(h1, "class", "title");
			add_location(h1, file, 19, 0, 769);
			attr(label0, "class", "form-label");
			add_location(label0, file, 21, 1, 841);
			ctx.$$binding_groups[0].push(input0);
			attr(input0, "type", "radio");
			attr(input0, "name", "column-size");
			input0.__value = "short";
			input0.value = input0.__value;
			add_location(input0, file, 28, 4, 1176);
			attr(i0, "class", "form-icon");
			add_location(i0, file, 34, 4, 1348);
			attr(label1, "class", "form-radio");
			add_location(label1, file, 27, 2, 1144);
			ctx.$$binding_groups[0].push(input1);
			attr(input1, "type", "radio");
			attr(input1, "name", "column-size");
			input1.__value = "long";
			input1.value = input1.__value;
			add_location(input1, file, 38, 4, 1437);
			attr(i1, "class", "form-icon");
			add_location(i1, file, 44, 4, 1608);
			attr(label2, "class", "form-radio");
			add_location(label2, file, 37, 2, 1405);
			attr(label3, "class", "form-label");
			attr(label3, "for", "limit");
			add_location(label3, file, 47, 2, 1664);
			attr(input2, "class", "form-input");
			attr(input2, "type", "number");
			add_location(input2, file, 48, 2, 1731);
			add_location(br0, file, 54, 2, 1860);
			add_location(i2, file, 59, 6, 2036);
			attr(a, "target", "_blank");
			attr(a, "href", "/docs/index.html#/message_types/");
			add_location(a, file, 57, 4, 1924);
			add_location(span, file, 55, 2, 1870);
			attr(input3, "type", "checkbox");
			add_location(input3, file, 63, 4, 2114);
			attr(i3, "class", "form-icon");
			add_location(i3, file, 69, 4, 2274);
			add_location(b0, file, 70, 4, 2303);
			attr(label4, "class", "form-switch");
			add_location(label4, file, 62, 2, 2081);
			attr(input4, "type", "checkbox");
			add_location(input4, file, 74, 4, 2427);
			attr(i4, "class", "form-icon");
			add_location(i4, file, 80, 4, 2584);
			add_location(b1, file, 81, 4, 2613);
			attr(label5, "class", "form-switch");
			add_location(label5, file, 73, 2, 2394);
			attr(input5, "type", "checkbox");
			add_location(input5, file, 85, 4, 2700);
			attr(i5, "class", "form-icon");
			add_location(i5, file, 91, 4, 2866);
			add_location(b2, file, 92, 4, 2895);
			attr(label6, "class", "form-switch");
			add_location(label6, file, 84, 2, 2667);
			attr(input6, "type", "checkbox");
			add_location(input6, file, 96, 4, 2996);
			attr(i6, "class", "form-icon");
			add_location(i6, file, 102, 4, 3162);
			add_location(b3, file, 103, 4, 3191);
			attr(label7, "class", "form-switch");
			add_location(label7, file, 95, 2, 2963);
			attr(input7, "type", "checkbox");
			add_location(input7, file, 107, 4, 3289);
			attr(i7, "class", "form-icon");
			add_location(i7, file, 113, 4, 3446);
			add_location(b4, file, 114, 4, 3475);
			attr(label8, "class", "form-switch");
			add_location(label8, file, 106, 2, 3256);
			attr(input8, "type", "checkbox");
			add_location(input8, file, 118, 4, 3600);
			attr(i8, "class", "form-icon");
			add_location(i8, file, 124, 4, 3754);
			add_location(b5, file, 125, 4, 3783);
			attr(label9, "class", "form-switch");
			add_location(label9, file, 117, 2, 3567);
			attr(input9, "type", "checkbox");
			add_location(input9, file, 130, 4, 3877);
			attr(i9, "class", "form-icon");
			add_location(i9, file, 136, 4, 4043);
			add_location(b6, file, 137, 4, 4072);
			attr(label10, "class", "form-switch");
			add_location(label10, file, 129, 2, 3844);
			attr(input10, "type", "checkbox");
			add_location(input10, file, 143, 4, 4249);
			attr(i10, "class", "form-icon");
			add_location(i10, file, 149, 4, 4406);
			add_location(b7, file, 150, 4, 4435);
			attr(label11, "class", "form-switch");
			add_location(label11, file, 142, 2, 4216);
			attr(div, "class", "divider");
			add_location(div, file, 153, 2, 4497);
			attr(input11, "type", "checkbox");
			add_location(input11, file, 155, 4, 4557);
			attr(i11, "class", "form-icon");
			add_location(i11, file, 161, 4, 4723);
			add_location(b8, file, 162, 4, 4752);
			attr(label12, "class", "form-switch");
			add_location(label12, file, 154, 2, 4524);
			add_location(br1, file, 165, 2, 4852);
			attr(form, "class", "form-group");
			add_location(form, file, 20, 0, 813);

			dispose = [
				listen(input0, "change", ctx.input0_change_handler),
				listen(input0, "change", ctx.change_handler),
				listen(input1, "change", ctx.input1_change_handler),
				listen(input1, "change", ctx.change_handler_1),
				listen(input2, "input", ctx.input2_input_handler),
				listen(input2, "change", ctx.change_handler_2),
				listen(input3, "change", ctx.input3_change_handler),
				listen(input3, "change", ctx.change_handler_3),
				listen(input4, "change", ctx.input4_change_handler),
				listen(input4, "change", ctx.change_handler_4),
				listen(input5, "change", ctx.input5_change_handler),
				listen(input5, "change", ctx.change_handler_5),
				listen(input6, "change", ctx.input6_change_handler),
				listen(input6, "change", ctx.change_handler_6),
				listen(input7, "change", ctx.input7_change_handler),
				listen(input7, "change", ctx.change_handler_7),
				listen(input8, "change", ctx.input8_change_handler),
				listen(input8, "change", ctx.change_handler_8),
				listen(input9, "change", ctx.input9_change_handler),
				listen(input9, "change", ctx.change_handler_9),
				listen(input10, "change", ctx.input10_change_handler),
				listen(input10, "change", ctx.change_handler_10),
				listen(input11, "change", ctx.input11_change_handler),
				listen(input11, "change", ctx.change_handler_11)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, h1, anchor);
			insert(target, t1, anchor);
			insert(target, form, anchor);
			append(form, label0);
			append(form, t3);
			append(form, label1);
			append(label1, input0);

			input0.checked = input0.__value === ctx.columnSize;

			append(label1, t4);
			append(label1, i0);
			append(label1, t5);
			append(form, t6);
			append(form, label2);
			append(label2, input1);

			input1.checked = input1.__value === ctx.columnSize;

			append(label2, t7);
			append(label2, i1);
			append(label2, t8);
			append(form, t9);
			append(form, label3);
			append(form, t11);
			append(form, input2);

			input2.value = ctx.limit;

			append(form, t12);
			append(form, br0);
			append(form, t13);
			append(form, span);
			append(span, t14);
			append(span, a);
			append(a, t15);
			append(a, i2);
			append(form, t17);
			append(form, label4);
			append(label4, input3);

			input3.checked = ctx.showTypeAbout;

			append(label4, t18);
			append(label4, i3);
			append(label4, t19);
			append(label4, b0);
			append(label4, t21);
			append(form, t22);
			append(form, label5);
			append(label5, input4);

			input4.checked = ctx.showTypeBlog;

			append(label5, t23);
			append(label5, i4);
			append(label5, t24);
			append(label5, b1);
			append(label5, t26);
			append(form, t27);
			append(form, label6);
			append(label6, input5);

			input5.checked = ctx.showTypeChannel;

			append(label6, t28);
			append(label6, i5);
			append(label6, t29);
			append(label6, b2);
			append(label6, t31);
			append(form, t32);
			append(form, label7);
			append(label7, input6);

			input6.checked = ctx.showTypeContact;

			append(label7, t33);
			append(label7, i6);
			append(label7, t34);
			append(label7, b3);
			append(label7, t36);
			append(form, t37);
			append(form, label8);
			append(label8, input7);

			input7.checked = ctx.showTypePost;

			append(label8, t38);
			append(label8, i7);
			append(label8, t39);
			append(label8, b4);
			append(label8, t41);
			append(form, t42);
			append(form, label9);
			append(label9, input8);

			input8.checked = ctx.showTypePub;

			append(label9, t43);
			append(label9, i8);
			append(label9, t44);
			append(label9, b5);
			append(label9, t46);
			append(form, t47);
			append(form, label10);
			append(label10, input9);

			input9.checked = ctx.showTypePrivate;

			append(label10, t48);
			append(label10, i9);
			append(label10, t49);
			append(label10, b6);
			append(label10, t51);
			append(form, t52);
			append(form, label11);
			append(label11, input10);

			input10.checked = ctx.showTypeVote;

			append(label11, t53);
			append(label11, i10);
			append(label11, t54);
			append(label11, b7);
			append(label11, t56);
			append(form, t57);
			append(form, div);
			append(form, t58);
			append(form, label12);
			append(label12, input11);

			input11.checked = ctx.showTypeUnknown;

			append(label12, t59);
			append(label12, i11);
			append(label12, t60);
			append(label12, b8);
			append(label12, t62);
			append(form, t63);
			append(form, br1);
		},

		p: function update(changed, ctx) {
			if (changed.columnSize) input0.checked = input0.__value === ctx.columnSize;
			if (changed.columnSize) input1.checked = input1.__value === ctx.columnSize;
			if (changed.limit) input2.value = ctx.limit;
			if (changed.showTypeAbout) input3.checked = ctx.showTypeAbout;
			if (changed.showTypeBlog) input4.checked = ctx.showTypeBlog;
			if (changed.showTypeChannel) input5.checked = ctx.showTypeChannel;
			if (changed.showTypeContact) input6.checked = ctx.showTypeContact;
			if (changed.showTypePost) input7.checked = ctx.showTypePost;
			if (changed.showTypePub) input8.checked = ctx.showTypePub;
			if (changed.showTypePrivate) input9.checked = ctx.showTypePrivate;
			if (changed.showTypeVote) input10.checked = ctx.showTypeVote;
			if (changed.showTypeUnknown) input11.checked = ctx.showTypeUnknown;
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h1);
				detach(t1);
				detach(form);
			}

			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input0), 1);
			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input1), 1);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { getPref, setPref } = require("../../prefs.js");
  let limit = getPref("limit", 10);
  let columnSize = getPref("columnSize", "short");

  document.title = "Patchfox - Settings - Display Preferences";

  // message type filters
  let showTypeUnknown = getPref("showTypeUnknown", false);
  let showTypeAbout = getPref("showTypeAbout", true);
  let showTypeBlog = getPref("showTypeBlog", true);
  let showTypeChannel = getPref("showTypeChannel", true);
  let showTypeContact = getPref("showTypeContact", true);
  let showTypePost = getPref("showTypePost", true);
  let showTypePrivate = getPref("showTypePrivate", true);
  let showTypePub = getPref("showTypePub", true);
  let showTypeVote = getPref("showTypeVote", true);

	const $$binding_groups = [[]];

	function input0_change_handler() {
		columnSize = this.__value;
		$$invalidate('columnSize', columnSize);
	}

	function change_handler() {
		return setPref('columnSize', columnSize);
	}

	function input1_change_handler() {
		columnSize = this.__value;
		$$invalidate('columnSize', columnSize);
	}

	function change_handler_1() {
		return setPref('columnSize', columnSize);
	}

	function input2_input_handler() {
		limit = to_number(this.value);
		$$invalidate('limit', limit);
	}

	function change_handler_2() {
		return setPref('limit', limit);
	}

	function input3_change_handler() {
		showTypeAbout = this.checked;
		$$invalidate('showTypeAbout', showTypeAbout);
	}

	function change_handler_3(ev) {
	        setPref('showTypeAbout', showTypeAbout);
	      }

	function input4_change_handler() {
		showTypeBlog = this.checked;
		$$invalidate('showTypeBlog', showTypeBlog);
	}

	function change_handler_4(ev) {
	        setPref('showTypeBlog', showTypeBlog);
	      }

	function input5_change_handler() {
		showTypeChannel = this.checked;
		$$invalidate('showTypeChannel', showTypeChannel);
	}

	function change_handler_5(ev) {
	        setPref('showTypeChannel', showTypeChannel);
	      }

	function input6_change_handler() {
		showTypeContact = this.checked;
		$$invalidate('showTypeContact', showTypeContact);
	}

	function change_handler_6(ev) {
	        setPref('showTypeContact', showTypeContact);
	      }

	function input7_change_handler() {
		showTypePost = this.checked;
		$$invalidate('showTypePost', showTypePost);
	}

	function change_handler_7(ev) {
	        setPref('showTypePost', showTypePost);
	      }

	function input8_change_handler() {
		showTypePub = this.checked;
		$$invalidate('showTypePub', showTypePub);
	}

	function change_handler_8(ev) {
	        setPref('showTypePub', showTypePub);
	      }

	function input9_change_handler() {
		showTypePrivate = this.checked;
		$$invalidate('showTypePrivate', showTypePrivate);
	}

	function change_handler_9(ev) {
	        setPref('showTypePrivate', showTypePrivate);
	      }

	function input10_change_handler() {
		showTypeVote = this.checked;
		$$invalidate('showTypeVote', showTypeVote);
	}

	function change_handler_10(ev) {
	        setPref('showTypeVote', showTypeVote);
	      }

	function input11_change_handler() {
		showTypeUnknown = this.checked;
		$$invalidate('showTypeUnknown', showTypeUnknown);
	}

	function change_handler_11(ev) {
	        setPref('showTypeUnknown', showTypeUnknown);
	      }

	return {
		setPref,
		limit,
		columnSize,
		showTypeUnknown,
		showTypeAbout,
		showTypeBlog,
		showTypeChannel,
		showTypeContact,
		showTypePost,
		showTypePrivate,
		showTypePub,
		showTypeVote,
		input0_change_handler,
		change_handler,
		input1_change_handler,
		change_handler_1,
		input2_input_handler,
		change_handler_2,
		input3_change_handler,
		change_handler_3,
		input4_change_handler,
		change_handler_4,
		input5_change_handler,
		change_handler_5,
		input6_change_handler,
		change_handler_6,
		input7_change_handler,
		change_handler_7,
		input8_change_handler,
		change_handler_8,
		input9_change_handler,
		change_handler_9,
		input10_change_handler,
		change_handler_10,
		input11_change_handler,
		change_handler_11,
		$$binding_groups
	};
}

class DisplayPreferences extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = DisplayPreferences;

},{"../../prefs.js":28,"svelte/internal":8}],41:[function(require,module,exports){
/* Filters.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	destroy_each,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	run_all,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");

const file = "Filters.svelte";

function get_each_context(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.filter = list[i];
	return child_ctx;
}

// (129:4) {:else}
function create_else_block(ctx) {
	var div, p, t_1;

	return {
		c: function create() {
			div = element("div");
			p = element("p");
			p.textContent = "You don't have any filter yet.";
			t_1 = space();
			attr(p, "class", "label");
			add_location(p, file, 130, 8, 4050);
			attr(div, "class", "column col-12");
			add_location(div, file, 129, 6, 4013);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, p);
			append(div, t_1);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (84:14) {#if filter.feed}
function create_if_block_3(ctx) {
	var li, t0, a, t1_value = ctx.filter.feed, t1, a_href_value;

	return {
		c: function create() {
			li = element("li");
			t0 = text("From\r\n                  ");
			a = element("a");
			t1 = text(t1_value);
			attr(a, "href", a_href_value = "?feed=" + ctx.filter.feed + "#/profile");
			attr(a, "target", "_blank");
			attr(a, "class", "feed");
			add_location(a, file, 86, 18, 2727);
			add_location(li, file, 84, 16, 2679);
		},

		m: function mount(target, anchor) {
			insert(target, li, anchor);
			append(li, t0);
			append(li, a);
			append(a, t1);
		},

		p: function update(changed, ctx) {
			if ((changed.currentFilters) && t1_value !== (t1_value = ctx.filter.feed)) {
				set_data(t1, t1_value);
			}

			if ((changed.currentFilters) && a_href_value !== (a_href_value = "?feed=" + ctx.filter.feed + "#/profile")) {
				attr(a, "href", a_href_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(li);
			}
		}
	};
}

// (95:14) {#if filter.channel}
function create_if_block_2(ctx) {
	var li, t0, a, t1, t2_value = ctx.filter.channel, t2, a_href_value;

	return {
		c: function create() {
			li = element("li");
			t0 = text("On channel\r\n                  ");
			a = element("a");
			t1 = text("#");
			t2 = text(t2_value);
			attr(a, "href", a_href_value = "?channel=" + ctx.filter.feed + "#/channel");
			attr(a, "target", "_blank");
			attr(a, "class", "feed");
			add_location(a, file, 97, 18, 3069);
			add_location(li, file, 95, 16, 3015);
		},

		m: function mount(target, anchor) {
			insert(target, li, anchor);
			append(li, t0);
			append(li, a);
			append(a, t1);
			append(a, t2);
		},

		p: function update(changed, ctx) {
			if ((changed.currentFilters) && t2_value !== (t2_value = ctx.filter.channel)) {
				set_data(t2, t2_value);
			}

			if ((changed.currentFilters) && a_href_value !== (a_href_value = "?channel=" + ctx.filter.feed + "#/channel")) {
				attr(a, "href", a_href_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(li);
			}
		}
	};
}

// (106:14) {#if filter.keywords.length > 0}
function create_if_block_1(ctx) {
	var i, li, t0, t1_value = ctx.filter.keywords.join(', '), t1;

	return {
		c: function create() {
			i = element("i");
			li = element("li");
			t0 = text("Containing: ");
			t1 = text(t1_value);
			add_location(li, file, 107, 18, 3399);
			add_location(i, file, 106, 16, 3376);
		},

		m: function mount(target, anchor) {
			insert(target, i, anchor);
			append(i, li);
			append(li, t0);
			append(li, t1);
		},

		p: function update(changed, ctx) {
			if ((changed.currentFilters) && t1_value !== (t1_value = ctx.filter.keywords.join(', '))) {
				set_data(t1, t1_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(i);
			}
		}
	};
}

// (111:14) {#if filter.expires}
function create_if_block(ctx) {
	var li, t0, t1_value = ctx.filter.expires, t1;

	return {
		c: function create() {
			li = element("li");
			t0 = text("Expiring in ");
			t1 = text(t1_value);
			add_location(li, file, 111, 16, 3545);
		},

		m: function mount(target, anchor) {
			insert(target, li, anchor);
			append(li, t0);
			append(li, t1);
		},

		p: function update(changed, ctx) {
			if ((changed.currentFilters) && t1_value !== (t1_value = ctx.filter.expires)) {
				set_data(t1, t1_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(li);
			}
		}
	};
}

// (76:4) {#each currentFilters as filter}
function create_each_block(ctx) {
	var div5, div4, div1, div0, t0_value = ctx.filter.action, t0, t1, div2, ul, t2, t3, t4, t5, div3, button, t7, dispose;

	var if_block0 = (ctx.filter.feed) && create_if_block_3(ctx);

	var if_block1 = (ctx.filter.channel) && create_if_block_2(ctx);

	var if_block2 = (ctx.filter.keywords.length > 0) && create_if_block_1(ctx);

	var if_block3 = (ctx.filter.expires) && create_if_block(ctx);

	function click_handler() {
		return ctx.click_handler(ctx);
	}

	return {
		c: function create() {
			div5 = element("div");
			div4 = element("div");
			div1 = element("div");
			div0 = element("div");
			t0 = text(t0_value);
			t1 = space();
			div2 = element("div");
			ul = element("ul");
			if (if_block0) if_block0.c();
			t2 = space();
			if (if_block1) if_block1.c();
			t3 = space();
			if (if_block2) if_block2.c();
			t4 = space();
			if (if_block3) if_block3.c();
			t5 = space();
			div3 = element("div");
			button = element("button");
			button.textContent = "Delete";
			t7 = space();
			attr(div0, "class", "card-title h5");
			add_location(div0, file, 79, 12, 2509);
			attr(div1, "class", "card-header");
			add_location(div1, file, 78, 10, 2470);
			add_location(ul, file, 82, 12, 2624);
			attr(div2, "class", "card-body");
			add_location(div2, file, 81, 10, 2587);
			attr(button, "class", "btn");
			attr(button, "aria-label", "Delete");
			add_location(button, file, 116, 12, 3691);
			attr(div3, "class", "card-footer");
			add_location(div3, file, 115, 10, 3652);
			attr(div4, "class", "card filter");
			add_location(div4, file, 77, 8, 2433);
			attr(div5, "class", "column col-6");
			add_location(div5, file, 76, 6, 2397);
			dispose = listen(button, "click", click_handler);
		},

		m: function mount(target, anchor) {
			insert(target, div5, anchor);
			append(div5, div4);
			append(div4, div1);
			append(div1, div0);
			append(div0, t0);
			append(div4, t1);
			append(div4, div2);
			append(div2, ul);
			if (if_block0) if_block0.m(ul, null);
			append(ul, t2);
			if (if_block1) if_block1.m(ul, null);
			append(ul, t3);
			if (if_block2) if_block2.m(ul, null);
			append(ul, t4);
			if (if_block3) if_block3.m(ul, null);
			append(div4, t5);
			append(div4, div3);
			append(div3, button);
			append(div5, t7);
		},

		p: function update(changed, new_ctx) {
			ctx = new_ctx;
			if ((changed.currentFilters) && t0_value !== (t0_value = ctx.filter.action)) {
				set_data(t0, t0_value);
			}

			if (ctx.filter.feed) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_3(ctx);
					if_block0.c();
					if_block0.m(ul, t2);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.filter.channel) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_2(ctx);
					if_block1.c();
					if_block1.m(ul, t3);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (ctx.filter.keywords.length > 0) {
				if (if_block2) {
					if_block2.p(changed, ctx);
				} else {
					if_block2 = create_if_block_1(ctx);
					if_block2.c();
					if_block2.m(ul, t4);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (ctx.filter.expires) {
				if (if_block3) {
					if_block3.p(changed, ctx);
				} else {
					if_block3 = create_if_block(ctx);
					if_block3.c();
					if_block3.m(ul, null);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div5);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			dispose();
		}
	};
}

function create_fragment(ctx) {
	var h1, t1, p0, t3, h50, t5, p1, t6, a, t8, t9, div1, div0, t10, h51, t12, form_group, label0, input0, t13, i0, t14, t15, label1, input1, t16, i1, t17, t18, label2, t20, input2, t21, label3, t23, input3, t24, label4, t26, input4, t27, label5, t29, input5, t30, br0, t31, button, t33, br1, t34, br2, dispose;

	var each_value = ctx.currentFilters;

	var each_blocks = [];

	for (var i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	var each_1_else = null;

	if (!each_value.length) {
		each_1_else = create_else_block(ctx);
		each_1_else.c();
	}

	return {
		c: function create() {
			h1 = element("h1");
			h1.textContent = "Filters";
			t1 = space();
			p0 = element("p");
			p0.textContent = "Use the features from this section to tailor your Patchfox experience to suit\r\n  your needs.";
			t3 = space();
			h50 = element("h5");
			h50.textContent = "Filters";
			t5 = space();
			p1 = element("p");
			t6 = text("Use filters to hide messages and blur images. Use any combination of channel,\r\n  feeds and keywords (separated by commas) to create your triggers and make SSB\r\n  the platform you want. Be aware that these filters are saved to your browser,\r\n  they are not shared on the feed, they don't affect gossiping, they only affect\r\n  the displaying of messages and images in Patchfox itself. If you create a\r\n  filter and open a different client, they won't be working there. If you want\r\n  to learn more about\r\n  ");
			a = element("a");
			a.textContent = "filters, click here to go to the documentation.";
			t8 = text("\r\n  You can create as many filters as you want.");
			t9 = space();
			div1 = element("div");
			div0 = element("div");

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t10 = space();
			h51 = element("h5");
			h51.textContent = "New Filter";
			t12 = space();
			form_group = element("form-group");
			label0 = element("label");
			input0 = element("input");
			t13 = space();
			i0 = element("i");
			t14 = text("\r\n    Hide Message");
			t15 = space();
			label1 = element("label");
			input1 = element("input");
			t16 = space();
			i1 = element("i");
			t17 = text("\r\n    Blur Images");
			t18 = space();
			label2 = element("label");
			label2.textContent = "Channel";
			t20 = space();
			input2 = element("input");
			t21 = space();
			label3 = element("label");
			label3.textContent = "Feed";
			t23 = space();
			input3 = element("input");
			t24 = space();
			label4 = element("label");
			label4.textContent = "Keywords";
			t26 = space();
			input4 = element("input");
			t27 = space();
			label5 = element("label");
			label5.textContent = "Expiration Date";
			t29 = space();
			input5 = element("input");
			t30 = space();
			br0 = element("br");
			t31 = space();
			button = element("button");
			button.textContent = "Add Filter";
			t33 = space();
			br1 = element("br");
			t34 = space();
			br2 = element("br");
			attr(h1, "class", "title");
			add_location(h1, file, 54, 0, 1473);
			add_location(p0, file, 55, 0, 1505);
			add_location(h50, file, 59, 0, 1612);
			attr(a, "href", "/docs/index.html#/features/filters");
			add_location(a, file, 68, 2, 2142);
			add_location(p1, file, 60, 0, 1630);
			attr(div0, "class", "columns");
			add_location(div0, file, 74, 2, 2330);
			attr(div1, "class", "container");
			add_location(div1, file, 73, 0, 2303);
			add_location(h51, file, 135, 0, 4148);
			ctx.$$binding_groups[0].push(input0);
			attr(input0, "type", "radio");
			attr(input0, "name", "filter-action");
			input0.__value = "hide";
			input0.value = input0.__value;
			add_location(input0, file, 138, 4, 4217);
			attr(i0, "class", "form-icon");
			add_location(i0, file, 143, 4, 4333);
			attr(label0, "class", "form-radio");
			add_location(label0, file, 137, 2, 4185);
			ctx.$$binding_groups[0].push(input1);
			attr(input1, "type", "radio");
			attr(input1, "name", "filter-action");
			input1.__value = "blur";
			input1.value = input1.__value;
			add_location(input1, file, 147, 4, 4422);
			attr(i1, "class", "form-icon");
			add_location(i1, file, 152, 4, 4538);
			attr(label1, "class", "form-radio");
			add_location(label1, file, 146, 2, 4390);
			attr(label2, "class", "form-label");
			attr(label2, "for", "remote");
			add_location(label2, file, 155, 2, 4594);
			attr(input2, "class", "form-input");
			attr(input2, "type", "text");
			attr(input2, "placeholder", "Channel");
			add_location(input2, file, 156, 2, 4652);
			attr(label3, "class", "form-label");
			attr(label3, "for", "remote");
			add_location(label3, file, 161, 2, 4765);
			attr(input3, "class", "form-input");
			attr(input3, "type", "text");
			attr(input3, "placeholder", "Feed");
			add_location(input3, file, 162, 2, 4820);
			attr(label4, "class", "form-label");
			attr(label4, "for", "remote");
			add_location(label4, file, 167, 2, 4927);
			attr(input4, "class", "form-input");
			attr(input4, "type", "text");
			attr(input4, "placeholder", "Keywords separated by commas");
			add_location(input4, file, 168, 2, 4986);
			attr(label5, "class", "form-label");
			attr(label5, "for", "remote");
			add_location(label5, file, 173, 2, 5121);
			attr(input5, "class", "form-input");
			attr(input5, "type", "date");
			attr(input5, "placeholder", "When should this filter expiry");
			add_location(input5, file, 174, 2, 5187);
			add_location(form_group, file, 136, 0, 4169);
			add_location(br0, file, 180, 0, 5335);
			attr(button, "class", "btn btn-primary");
			add_location(button, file, 181, 0, 5343);
			add_location(br1, file, 182, 0, 5420);
			add_location(br2, file, 183, 0, 5428);

			dispose = [
				listen(input0, "change", ctx.input0_change_handler),
				listen(input1, "change", ctx.input1_change_handler),
				listen(input2, "input", ctx.input2_input_handler),
				listen(input3, "input", ctx.input3_input_handler),
				listen(input4, "input", ctx.input4_input_handler),
				listen(input5, "input", ctx.input5_input_handler),
				listen(button, "click", ctx.addNewFilter)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, h1, anchor);
			insert(target, t1, anchor);
			insert(target, p0, anchor);
			insert(target, t3, anchor);
			insert(target, h50, anchor);
			insert(target, t5, anchor);
			insert(target, p1, anchor);
			append(p1, t6);
			append(p1, a);
			append(p1, t8);
			insert(target, t9, anchor);
			insert(target, div1, anchor);
			append(div1, div0);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(div0, null);
			}

			if (each_1_else) {
				each_1_else.m(div0, null);
			}

			insert(target, t10, anchor);
			insert(target, h51, anchor);
			insert(target, t12, anchor);
			insert(target, form_group, anchor);
			append(form_group, label0);
			append(label0, input0);

			input0.checked = input0.__value === ctx.filterAction;

			append(label0, t13);
			append(label0, i0);
			append(label0, t14);
			append(form_group, t15);
			append(form_group, label1);
			append(label1, input1);

			input1.checked = input1.__value === ctx.filterAction;

			append(label1, t16);
			append(label1, i1);
			append(label1, t17);
			append(form_group, t18);
			append(form_group, label2);
			append(form_group, t20);
			append(form_group, input2);

			input2.value = ctx.filterChannel;

			append(form_group, t21);
			append(form_group, label3);
			append(form_group, t23);
			append(form_group, input3);

			input3.value = ctx.filterFeed;

			append(form_group, t24);
			append(form_group, label4);
			append(form_group, t26);
			append(form_group, input4);

			input4.value = ctx.filterKeywords;

			append(form_group, t27);
			append(form_group, label5);
			append(form_group, t29);
			append(form_group, input5);

			input5.value = ctx.filterExpiry;

			insert(target, t30, anchor);
			insert(target, br0, anchor);
			insert(target, t31, anchor);
			insert(target, button, anchor);
			insert(target, t33, anchor);
			insert(target, br1, anchor);
			insert(target, t34, anchor);
			insert(target, br2, anchor);
		},

		p: function update(changed, ctx) {
			if (changed.currentFilters) {
				each_value = ctx.currentFilters;

				for (var i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(changed, child_ctx);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div0, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}
				each_blocks.length = each_value.length;
			}

			if (each_value.length) {
				if (each_1_else) {
					each_1_else.d(1);
					each_1_else = null;
				}
			} else if (!each_1_else) {
				each_1_else = create_else_block(ctx);
				each_1_else.c();
				each_1_else.m(div0, null);
			}

			if (changed.filterAction) input0.checked = input0.__value === ctx.filterAction;
			if (changed.filterAction) input1.checked = input1.__value === ctx.filterAction;
			if (changed.filterChannel && (input2.value !== ctx.filterChannel)) input2.value = ctx.filterChannel;
			if (changed.filterFeed && (input3.value !== ctx.filterFeed)) input3.value = ctx.filterFeed;
			if (changed.filterKeywords && (input4.value !== ctx.filterKeywords)) input4.value = ctx.filterKeywords;
			if (changed.filterExpiry) input5.value = ctx.filterExpiry;
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h1);
				detach(t1);
				detach(p0);
				detach(t3);
				detach(h50);
				detach(t5);
				detach(p1);
				detach(t9);
				detach(div1);
			}

			destroy_each(each_blocks, detaching);

			if (each_1_else) each_1_else.d();

			if (detaching) {
				detach(t10);
				detach(h51);
				detach(t12);
				detach(form_group);
			}

			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input0), 1);
			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input1), 1);

			if (detaching) {
				detach(t30);
				detach(br0);
				detach(t31);
				detach(button);
				detach(t33);
				detach(br1);
				detach(t34);
				detach(br2);
			}

			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { getPref, setPref } = require("../../prefs.js");
  const {
    getFilters,
    addFilter,
    deleteFilter
  } = require("../../abusePrevention.js");

  // Abuse Prevention - filters
  let currentFilters = getFilters();
  let filterFeed = "";
  let filterChannel = "";
  let filterKeywords = "";
  let filterExpiry = "";
  let filterAction = "";

  const addNewFilter = () => {
    let keywords = filterKeywords
      .split(",")
      .map(v => v.trim())
      .filter(v => v.length !== 0);

    let filter = {};
    filter.action = filterAction.length !== 0 ? filterAction : false;
    filter.feed = filterFeed.length !== 0 ? filterFeed : false;
    filter.channel = filterChannel.length !== 0 ? filterChannel : false;
    filter.keywords = keywords;
    filter.expires = filterExpiry.length !== 0 ? filterExpiry : false;

    if (filter.channel && filter.channel.startsWith("#")) {
      filter.channel = filter.channel.slice(1);
    }

    if (
      filter.action &&
      (filter.feed || filter.channel || filter.keywords.length > 0)
    ) {
      addFilter(filter);

      $$invalidate('currentFilters', currentFilters = getFilters());

      console.dir("filters", currentFilters);

      $$invalidate('filterFeed', filterFeed = "");
      $$invalidate('filterChannel', filterChannel = "");
      $$invalidate('filterKeywords', filterKeywords = "");
      $$invalidate('filterExpiry', filterExpiry = "");
      $$invalidate('filterAction', filterAction = "");
    } else {
      alert("Fill at least filter action and one of feed, channel or keywords");
    }
  };

	const $$binding_groups = [[]];

	function click_handler({ filter }) {
	                deleteFilter(filter);
	                currentFilters = getFilters(); $$invalidate('currentFilters', currentFilters);
	              }

	function input0_change_handler() {
		filterAction = this.__value;
		$$invalidate('filterAction', filterAction);
	}

	function input1_change_handler() {
		filterAction = this.__value;
		$$invalidate('filterAction', filterAction);
	}

	function input2_input_handler() {
		filterChannel = this.value;
		$$invalidate('filterChannel', filterChannel);
	}

	function input3_input_handler() {
		filterFeed = this.value;
		$$invalidate('filterFeed', filterFeed);
	}

	function input4_input_handler() {
		filterKeywords = this.value;
		$$invalidate('filterKeywords', filterKeywords);
	}

	function input5_input_handler() {
		filterExpiry = this.value;
		$$invalidate('filterExpiry', filterExpiry);
	}

	return {
		getFilters,
		deleteFilter,
		currentFilters,
		filterFeed,
		filterChannel,
		filterKeywords,
		filterExpiry,
		filterAction,
		addNewFilter,
		click_handler,
		input0_change_handler,
		input1_change_handler,
		input2_input_handler,
		input3_input_handler,
		input4_input_handler,
		input5_input_handler,
		$$binding_groups
	};
}

class Filters extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Filters;

},{"../../abusePrevention.js":14,"../../prefs.js":28,"svelte/internal":8}],42:[function(require,module,exports){
/* IdentityAndConnection.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	run_all,
	safe_not_equal,
	space,
	text
} = require("svelte/internal");

const file = "IdentityAndConnection.svelte";

function create_fragment(ctx) {
	var h1, t1, p0, b, t2, i0, t4, i1, t6, i2, t8, code0, t10, code1, t12, code2, t14, a, t16, t17, form, label0, t18, code3, t20, t21, input0, t22, label1, t24, input1, t25, label2, t27, textarea, t28, br, t29, button, t31, p1, dispose;

	return {
		c: function create() {
			h1 = element("h1");
			h1.textContent = "Identity & Connection";
			t1 = space();
			p0 = element("p");
			b = element("b");
			t2 = text("You can't use Patchfox until you fill your\r\n    ");
			i0 = element("i");
			i0.textContent = "Identity & Connection";
			t4 = text("\r\n    information. Patchfox can infer the values for both\r\n    ");
			i1 = element("i");
			i1.textContent = "remote";
			t6 = text("\r\n    and\r\n    ");
			i2 = element("i");
			i2.textContent = "secret";
			t8 = text("\r\n    from your\r\n    ");
			code0 = element("code");
			code0.textContent = "~/.ssb/secret";
			t10 = text("\r\n    file. The main problem is that the folder\r\n    ");
			code1 = element("code");
			code1.textContent = ".ssb";
			t12 = text("\r\n    is hidden in most systems and it might be hard to find on your machine. If\r\n    you have used Secure Scuttlebutt before and already have an identity but\r\n    can't find a folder named\r\n    ");
			code2 = element("code");
			code2.textContent = ".ssb";
			t14 = text("\r\n    inside your home folder, go to\r\n    ");
			a = element("a");
			a.textContent = "this link to learn more about how to display hidden folders and setup\r\n      Patchfox";
			t16 = text("\r\n    .");
			t17 = space();
			form = element("form");
			label0 = element("label");
			t18 = text("Use the button below to select your secret file (usually located at\r\n    ");
			code3 = element("code");
			code3.textContent = "~/.ssb/secret";
			t20 = text("\r\n    ).");
			t21 = space();
			input0 = element("input");
			t22 = space();
			label1 = element("label");
			label1.textContent = "Remote";
			t24 = space();
			input1 = element("input");
			t25 = space();
			label2 = element("label");
			label2.textContent = "Secret";
			t27 = space();
			textarea = element("textarea");
			t28 = space();
			br = element("br");
			t29 = space();
			button = element("button");
			button.textContent = "Save Identity & Remote";
			t31 = space();
			p1 = element("p");
			p1.textContent = "Saving identity and remote will cause a full page refresh.";
			add_location(h1, file, 55, 0, 1516);
			add_location(i0, file, 59, 4, 1616);
			add_location(i1, file, 61, 4, 1711);
			add_location(i2, file, 63, 4, 1739);
			add_location(code0, file, 65, 4, 1773);
			add_location(code1, file, 67, 4, 1852);
			add_location(code2, file, 71, 4, 2064);
			attr(a, "href", "/docs/index.html#/troubleshooting/no-configuration");
			attr(a, "target", "_blank");
			add_location(a, file, 73, 4, 2123);
			add_location(b, file, 57, 2, 1559);
			add_location(p0, file, 56, 0, 1552);
			add_location(code3, file, 86, 4, 2494);
			attr(label0, "class", "form-label");
			attr(label0, "for", "secret-file");
			add_location(label0, file, 84, 2, 2371);
			attr(input0, "type", "file");
			attr(input0, "class", "form-input");
			attr(input0, "id", "secret-file");
			add_location(input0, file, 89, 2, 2544);
			attr(label1, "class", "form-label");
			attr(label1, "for", "remote");
			add_location(label1, file, 94, 2, 2650);
			attr(input1, "class", "form-input");
			attr(input1, "type", "text");
			attr(input1, "id", "remote");
			attr(input1, "placeholder", "remote");
			add_location(input1, file, 95, 2, 2707);
			attr(label2, "class", "form-label");
			attr(label2, "for", "secret");
			add_location(label2, file, 102, 2, 2831);
			attr(textarea, "class", "form-input");
			attr(textarea, "id", "secret");
			attr(textarea, "placeholder", "Your secret");
			attr(textarea, "rows", "8");
			add_location(textarea, file, 103, 2, 2888);
			add_location(br, file, 109, 2, 3013);
			attr(button, "class", "btn btn-primary float-right");
			add_location(button, file, 110, 2, 3023);
			add_location(p1, file, 113, 2, 3141);
			attr(form, "class", "form-group");
			add_location(form, file, 83, 0, 2342);

			dispose = [
				listen(input0, "change", ctx.selectedFile),
				listen(input1, "input", ctx.input1_input_handler),
				listen(textarea, "input", ctx.textarea_input_handler),
				listen(button, "click", ctx.saveConfiguration)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, h1, anchor);
			insert(target, t1, anchor);
			insert(target, p0, anchor);
			append(p0, b);
			append(b, t2);
			append(b, i0);
			append(b, t4);
			append(b, i1);
			append(b, t6);
			append(b, i2);
			append(b, t8);
			append(b, code0);
			append(b, t10);
			append(b, code1);
			append(b, t12);
			append(b, code2);
			append(b, t14);
			append(b, a);
			append(b, t16);
			insert(target, t17, anchor);
			insert(target, form, anchor);
			append(form, label0);
			append(label0, t18);
			append(label0, code3);
			append(label0, t20);
			append(form, t21);
			append(form, input0);
			append(form, t22);
			append(form, label1);
			append(form, t24);
			append(form, input1);

			input1.value = ctx.remote;

			append(form, t25);
			append(form, label2);
			append(form, t27);
			append(form, textarea);

			textarea.value = ctx.keys;

			append(form, t28);
			append(form, br);
			append(form, t29);
			append(form, button);
			append(form, t31);
			append(form, p1);
		},

		p: function update(changed, ctx) {
			if (changed.remote && (input1.value !== ctx.remote)) input1.value = ctx.remote;
			if (changed.keys) textarea.value = ctx.keys;
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h1);
				detach(t1);
				detach(p0);
				detach(t17);
				detach(form);
			}

			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const {
    getPref,
    setPref,
    setConnectionConfiguration
  } = require("../../prefs.js");
  const { navigate } = require("../../utils.js");
  let keys = {};
  let remote = "";
  document.title = "Patchfox - Settings - Identity And Connection";

  const saveConfiguration = ev => {
    setConnectionConfiguration({ remote, keys: JSON.parse(keys), manifest });
    navigate("/public");
    location.reload();
  };

  const selectedFile = ev => {
    const secretFile = ev.target.files[0];
    const reader = new FileReader();
    reader.onload = function(evt) {
      console.log(evt.target.result);
      const contents = evt.target.result;
      let secret = contents.split("\n").filter(function(line) {
        return line.indexOf("#") != 0;
      });
      secret = JSON.parse(secret.join("\n"));
      $$invalidate('remote', remote = `ws://localhost:8989~shs:${secret.id.slice(
        0,
        secret.id.indexOf("=") + 1
      )}`);
      updateUI({ keys: secret, remote });
    };
    reader.readAsText(secretFile);
  };

  const updateUI = savedData => {
    console.log("saved data from settings", savedData);
    $$invalidate('remote', remote = savedData.remote || "");
    if (savedData.keys) {
      $$invalidate('keys', keys = JSON.stringify(savedData.keys, null, 2));
    } else {
      $$invalidate('keys', keys = "");
    }
  };

  const onError = error => {
    console.error("error on settings", error);
  };

  const gettingStoredSettings = browser.storage.local
    .get()
    .then(updateUI, onError);

	function input1_input_handler() {
		remote = this.value;
		$$invalidate('remote', remote);
	}

	function textarea_input_handler() {
		keys = this.value;
		$$invalidate('keys', keys);
	}

	return {
		keys,
		remote,
		saveConfiguration,
		selectedFile,
		input1_input_handler,
		textarea_input_handler
	};
}

class IdentityAndConnection extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = IdentityAndConnection;

},{"../../prefs.js":28,"../../utils.js":30,"svelte/internal":8}],43:[function(require,module,exports){
/* Menu.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	run_all,
	safe_not_equal,
	space,
	toggle_class
} = require("svelte/internal");
const { createEventDispatcher } = require("svelte");

const file = "Menu.svelte";

function create_fragment(ctx) {
	var ul, li0, t0, li1, a0, t2, li2, a1, t4, li3, t5, li4, a2, t7, li5, a3, t9, li6, t10, li7, a4, dispose;

	return {
		c: function create() {
			ul = element("ul");
			li0 = element("li");
			t0 = space();
			li1 = element("li");
			a0 = element("a");
			a0.textContent = "Identity & Connection";
			t2 = space();
			li2 = element("li");
			a1 = element("a");
			a1.textContent = "Display Preferences";
			t4 = space();
			li3 = element("li");
			t5 = space();
			li4 = element("li");
			a2 = element("a");
			a2.textContent = "Filters";
			t7 = space();
			li5 = element("li");
			a3 = element("a");
			a3.textContent = "Content Warnings";
			t9 = space();
			li6 = element("li");
			t10 = space();
			li7 = element("li");
			a4 = element("a");
			a4.textContent = "IPFS";
			attr(li0, "class", "divider");
			attr(li0, "data-content", "GENERAL");
			add_location(li0, file, 15, 2, 275);
			attr(a0, "href", "#/settings");
			toggle_class(a0, "active", ctx.currentView === 'identityAndConnection');
			add_location(a0, file, 17, 4, 352);
			attr(li1, "class", "menu-item");
			add_location(li1, file, 16, 2, 324);
			attr(a1, "href", "#/settings");
			toggle_class(a1, "active", ctx.currentView === 'displayPreferences');
			add_location(a1, file, 25, 4, 583);
			attr(li2, "class", "menu-item");
			add_location(li2, file, 24, 2, 555);
			attr(li3, "class", "divider");
			attr(li3, "data-content", "ABUSE PREVENTION");
			add_location(li3, file, 32, 2, 774);
			attr(a2, "href", "#/settings");
			toggle_class(a2, "active", ctx.currentView === 'filters');
			add_location(a2, file, 34, 4, 860);
			attr(li4, "class", "menu-item");
			add_location(li4, file, 33, 2, 832);
			attr(a3, "href", "#/settings");
			toggle_class(a3, "active", ctx.currentView === 'contentWarnings');
			add_location(a3, file, 42, 4, 1045);
			attr(li5, "class", "menu-item");
			add_location(li5, file, 41, 2, 1017);
			attr(li6, "class", "divider");
			attr(li6, "data-content", "ADITIONAL PLATFORMS");
			add_location(li6, file, 49, 2, 1227);
			attr(a4, "href", "#/settings");
			toggle_class(a4, "active", ctx.currentView === 'platformIPFS');
			add_location(a4, file, 59, 4, 1514);
			attr(li7, "class", "menu-item");
			add_location(li7, file, 58, 2, 1486);
			attr(ul, "class", "menu");
			add_location(ul, file, 14, 0, 254);

			dispose = [
				listen(a0, "click", ctx.click_handler),
				listen(a1, "click", ctx.click_handler_1),
				listen(a2, "click", ctx.click_handler_2),
				listen(a3, "click", ctx.click_handler_3),
				listen(a4, "click", ctx.click_handler_4)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, ul, anchor);
			append(ul, li0);
			append(ul, t0);
			append(ul, li1);
			append(li1, a0);
			append(ul, t2);
			append(ul, li2);
			append(li2, a1);
			append(ul, t4);
			append(ul, li3);
			append(ul, t5);
			append(ul, li4);
			append(li4, a2);
			append(ul, t7);
			append(ul, li5);
			append(li5, a3);
			append(ul, t9);
			append(ul, li6);
			append(ul, t10);
			append(ul, li7);
			append(li7, a4);
		},

		p: function update(changed, ctx) {
			if (changed.currentView) {
				toggle_class(a0, "active", ctx.currentView === 'identityAndConnection');
				toggle_class(a1, "active", ctx.currentView === 'displayPreferences');
				toggle_class(a2, "active", ctx.currentView === 'filters');
				toggle_class(a3, "active", ctx.currentView === 'contentWarnings');
				toggle_class(a4, "active", ctx.currentView === 'platformIPFS');
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(ul);
			}

			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const dispatch = createEventDispatcher();

  let { currentView = "" } = $$props;

  const setView = currentView => {
    dispatch("message", {
      currentView
    });
  };

	const writable_props = ['currentView'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Menu> was created with unknown prop '${key}'`);
	});

	function click_handler() {
		return setView('identityAndConnection');
	}

	function click_handler_1() {
		return setView('displayPreferences');
	}

	function click_handler_2() {
		return setView('filters');
	}

	function click_handler_3() {
		return setView('contentWarnings');
	}

	function click_handler_4() {
		return setView('platformIPFS');
	}

	$$self.$set = $$props => {
		if ('currentView' in $$props) $$invalidate('currentView', currentView = $$props.currentView);
	};

	return {
		currentView,
		setView,
		click_handler,
		click_handler_1,
		click_handler_2,
		click_handler_3,
		click_handler_4
	};
}

class Menu extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, ["currentView"]);
	}

	get currentView() {
		throw new Error("<Menu>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set currentView(value) {
		throw new Error("<Menu>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = Menu;

},{"svelte":7,"svelte/internal":8}],44:[function(require,module,exports){
/* PlatformDAT.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	run_all,
	safe_not_equal,
	space,
	text
} = require("svelte/internal");

const file = "PlatformDAT.svelte";

function create_fragment(ctx) {
	var h1, t1, form, label0, t2, a, t4, t5, label1, input0, t6, i0, t7, t8, label2, input1, t9, i1, t10, dispose;

	return {
		c: function create() {
			h1 = element("h1");
			h1.textContent = "DAT";
			t1 = space();
			form = element("form");
			label0 = element("label");
			t2 = text("Enable support for ");
			a = element("a");
			a.textContent = "DAT";
			t4 = text("?");
			t5 = space();
			label1 = element("label");
			input0 = element("input");
			t6 = space();
			i0 = element("i");
			t7 = text("\r\n    Yes");
			t8 = space();
			label2 = element("label");
			input1 = element("input");
			t9 = space();
			i1 = element("i");
			t10 = text("\r\n    No");
			attr(h1, "class", "title");
			add_location(h1, file, 5, 0, 141);
			attr(a, "href", "https://dat.foundation/");
			attr(a, "target", "_blank");
			add_location(a, file, 8, 23, 249);
			attr(label0, "class", "form-label");
			add_location(label0, file, 7, 2, 198);
			ctx.$$binding_groups[0].push(input0);
			attr(input0, "type", "radio");
			attr(input0, "name", "column-size");
			input0.__value = "yes";
			input0.value = input0.__value;
			add_location(input0, file, 11, 4, 355);
			attr(i0, "class", "form-icon");
			add_location(i0, file, 17, 4, 533);
			attr(label1, "class", "form-radio");
			add_location(label1, file, 10, 2, 323);
			ctx.$$binding_groups[0].push(input1);
			attr(input1, "type", "radio");
			attr(input1, "name", "column-size");
			input1.__value = "no";
			input1.value = input1.__value;
			add_location(input1, file, 21, 4, 613);
			attr(i1, "class", "form-icon");
			add_location(i1, file, 27, 4, 790);
			attr(label2, "class", "form-radio");
			add_location(label2, file, 20, 2, 581);
			attr(form, "class", "form-group");
			add_location(form, file, 6, 0, 169);

			dispose = [
				listen(input0, "change", ctx.input0_change_handler),
				listen(input0, "change", ctx.change_handler),
				listen(input1, "change", ctx.input1_change_handler),
				listen(input1, "change", ctx.change_handler_1)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, h1, anchor);
			insert(target, t1, anchor);
			insert(target, form, anchor);
			append(form, label0);
			append(label0, t2);
			append(label0, a);
			append(label0, t4);
			append(form, t5);
			append(form, label1);
			append(label1, input0);

			input0.checked = input0.__value === ctx.enableDAT;

			append(label1, t6);
			append(label1, i0);
			append(label1, t7);
			append(form, t8);
			append(form, label2);
			append(label2, input1);

			input1.checked = input1.__value === ctx.enableDAT;

			append(label2, t9);
			append(label2, i1);
			append(label2, t10);
		},

		p: function update(changed, ctx) {
			if (changed.enableDAT) input0.checked = input0.__value === ctx.enableDAT;
			if (changed.enableDAT) input1.checked = input1.__value === ctx.enableDAT;
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h1);
				detach(t1);
				detach(form);
			}

			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input0), 1);
			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input1), 1);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { getPref, setPref } = require("../../prefs.js");
  let enableDAT = getPref("platform-dat-enabled", "yes");

	const $$binding_groups = [[]];

	function input0_change_handler() {
		enableDAT = this.__value;
		$$invalidate('enableDAT', enableDAT);
	}

	function change_handler() {
		return setPref('platform-dat-enabled', enableDAT);
	}

	function input1_change_handler() {
		enableDAT = this.__value;
		$$invalidate('enableDAT', enableDAT);
	}

	function change_handler_1() {
		return setPref('platform-dat-enabled', enableDAT);
	}

	return {
		setPref,
		enableDAT,
		input0_change_handler,
		change_handler,
		input1_change_handler,
		change_handler_1,
		$$binding_groups
	};
}

class PlatformDAT extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = PlatformDAT;

},{"../../prefs.js":28,"svelte/internal":8}],45:[function(require,module,exports){
/* PlatformIPFS.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	listen,
	noop,
	run_all,
	safe_not_equal,
	space,
	text
} = require("svelte/internal");

const file = "PlatformIPFS.svelte";

function create_fragment(ctx) {
	var h1, t1, form, label0, t2, a, t4, t5, label1, input0, t6, i0, t7, t8, label2, input1, t9, i1, t10, dispose;

	return {
		c: function create() {
			h1 = element("h1");
			h1.textContent = "IPFS";
			t1 = space();
			form = element("form");
			label0 = element("label");
			t2 = text("Enable integration with ");
			a = element("a");
			a.textContent = "IPFS - The Interplanetary Filesystem";
			t4 = text("?");
			t5 = space();
			label1 = element("label");
			input0 = element("input");
			t6 = space();
			i0 = element("i");
			t7 = text("\r\n    Yes");
			t8 = space();
			label2 = element("label");
			input1 = element("input");
			t9 = space();
			i1 = element("i");
			t10 = text("\r\n    No");
			attr(h1, "class", "title");
			add_location(h1, file, 5, 0, 143);
			attr(a, "href", "https://ipfs.io");
			attr(a, "target", "_blank");
			add_location(a, file, 8, 28, 257);
			attr(label0, "class", "form-label");
			add_location(label0, file, 7, 2, 201);
			ctx.$$binding_groups[0].push(input0);
			attr(input0, "type", "radio");
			attr(input0, "name", "column-size");
			input0.__value = "yes";
			input0.value = input0.__value;
			add_location(input0, file, 11, 4, 388);
			attr(i0, "class", "form-icon");
			add_location(i0, file, 17, 4, 569);
			attr(label1, "class", "form-radio");
			add_location(label1, file, 10, 2, 356);
			ctx.$$binding_groups[0].push(input1);
			attr(input1, "type", "radio");
			attr(input1, "name", "column-size");
			input1.__value = "no";
			input1.value = input1.__value;
			add_location(input1, file, 21, 4, 649);
			attr(i1, "class", "form-icon");
			add_location(i1, file, 27, 4, 829);
			attr(label2, "class", "form-radio");
			add_location(label2, file, 20, 2, 617);
			attr(form, "class", "form-group");
			add_location(form, file, 6, 0, 172);

			dispose = [
				listen(input0, "change", ctx.input0_change_handler),
				listen(input0, "change", ctx.change_handler),
				listen(input1, "change", ctx.input1_change_handler),
				listen(input1, "change", ctx.change_handler_1)
			];
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, h1, anchor);
			insert(target, t1, anchor);
			insert(target, form, anchor);
			append(form, label0);
			append(label0, t2);
			append(label0, a);
			append(label0, t4);
			append(form, t5);
			append(form, label1);
			append(label1, input0);

			input0.checked = input0.__value === ctx.enableIPFS;

			append(label1, t6);
			append(label1, i0);
			append(label1, t7);
			append(form, t8);
			append(form, label2);
			append(label2, input1);

			input1.checked = input1.__value === ctx.enableIPFS;

			append(label2, t9);
			append(label2, i1);
			append(label2, t10);
		},

		p: function update(changed, ctx) {
			if (changed.enableIPFS) input0.checked = input0.__value === ctx.enableIPFS;
			if (changed.enableIPFS) input1.checked = input1.__value === ctx.enableIPFS;
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h1);
				detach(t1);
				detach(form);
			}

			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input0), 1);
			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input1), 1);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const { getPref, setPref } = require("../../prefs.js");
  let enableIPFS = getPref("platform-ipfs-enabled", "yes");

	const $$binding_groups = [[]];

	function input0_change_handler() {
		enableIPFS = this.__value;
		$$invalidate('enableIPFS', enableIPFS);
	}

	function change_handler() {
		return setPref('platform-ipfs-enabled', enableIPFS);
	}

	function input1_change_handler() {
		enableIPFS = this.__value;
		$$invalidate('enableIPFS', enableIPFS);
	}

	function change_handler_1() {
		return setPref('platform-ipfs-enabled', enableIPFS);
	}

	return {
		setPref,
		enableIPFS,
		input0_change_handler,
		change_handler,
		input1_change_handler,
		change_handler_1,
		$$binding_groups
	};
}

class PlatformIPFS extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = PlatformIPFS;

},{"../../prefs.js":28,"svelte/internal":8}],46:[function(require,module,exports){
/* Settings.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	check_outros,
	destroy_component,
	detach,
	element,
	group_outros,
	init,
	insert,
	mount_component,
	safe_not_equal,
	space,
	transition_in,
	transition_out
} = require("svelte/internal");

const file = "Settings.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-1e0jkdi-style';
	style.textContent = "\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3Muc3ZlbHRlIiwic291cmNlcyI6WyJTZXR0aW5ncy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cclxuICBjb25zdCBNZW51ID0gcmVxdWlyZShcIi4vTWVudS5zdmVsdGVcIik7XHJcbiAgY29uc3QgSWRlbnRpdHlBbmRDb25uZWN0aW9uID0gcmVxdWlyZShcIi4vSWRlbnRpdHlBbmRDb25uZWN0aW9uLnN2ZWx0ZVwiKTtcclxuICBjb25zdCBEaXNwbGF5UHJlZmVyZW5jZXMgPSByZXF1aXJlKFwiLi9EaXNwbGF5UHJlZmVyZW5jZXMuc3ZlbHRlXCIpO1xyXG4gIGNvbnN0IEZpbHRlcnMgPSByZXF1aXJlKFwiLi9GaWx0ZXJzLnN2ZWx0ZVwiKTtcclxuICBjb25zdCBDb250ZW50V2FybmluZ3MgPSByZXF1aXJlKFwiLi9Db250ZW50V2FybmluZ3Muc3ZlbHRlXCIpO1xyXG4gIGNvbnN0IFBsYXRmb3JtREFUID0gcmVxdWlyZShcIi4vUGxhdGZvcm1EQVQuc3ZlbHRlXCIpO1xyXG4gIGNvbnN0IFBsYXRmb3JtSVBGUyA9IHJlcXVpcmUoXCIuL1BsYXRmb3JtSVBGUy5zdmVsdGVcIik7XHJcblxyXG4gIGNvbnN0IHZpZXdzID0ge1xyXG4gICAgaWRlbnRpdHlBbmRDb25uZWN0aW9uOiBJZGVudGl0eUFuZENvbm5lY3Rpb24sXHJcbiAgICBkaXNwbGF5UHJlZmVyZW5jZXM6IERpc3BsYXlQcmVmZXJlbmNlcyxcclxuICAgIGZpbHRlcnM6IEZpbHRlcnMsXHJcbiAgICBjb250ZW50V2FybmluZ3M6IENvbnRlbnRXYXJuaW5ncyxcclxuICAgIHBsYXRmb3JtREFUOiBQbGF0Zm9ybURBVCxcclxuICAgIHBsYXRmb3JtSVBGUzogUGxhdGZvcm1JUEZTXHJcbiAgfTtcclxuXHJcbiAgbGV0IGN1cnJlbnRWaWV3ID0gXCJpZGVudGl0eUFuZENvbm5lY3Rpb25cIjtcclxuXHJcbiAgY29uc3QgaGFuZGxlTWVudUNoYW5nZSA9IGV2ID0+IHtcclxuICAgIGN1cnJlbnRWaWV3ID0gZXYuZGV0YWlsLmN1cnJlbnRWaWV3O1xyXG4gIH07XHJcbjwvc2NyaXB0PlxyXG5cclxuPHN0eWxlPlxyXG4gIC5maWx0ZXIge1xyXG4gICAgaGVpZ2h0OiAzMDBweDtcclxuICAgIG1hcmdpbi1ib3R0b206IDAuNHJlbTtcclxuICAgIG92ZXJmbG93OiBoaWRkZW47XHJcbiAgfVxyXG5cclxuICAuZmVlZCB7XHJcbiAgICBtYXgtd2lkdGg6IDEwMCU7XHJcbiAgICBvdmVyZmxvdzogaGlkZGVuO1xyXG4gIH1cclxuPC9zdHlsZT5cclxuXHJcbjxkaXYgY2xhc3M9XCJjb2x1bW5zXCI+XHJcbiAgPGRpdiBjbGFzcz1cImNvbHVtbiBjb2wtYXV0b1wiPlxyXG4gICAgPE1lbnUge2N1cnJlbnRWaWV3fSBvbjptZXNzYWdlPXtoYW5kbGVNZW51Q2hhbmdlfSAvPlxyXG4gIDwvZGl2PlxyXG4gIDxkaXYgY2xhc3M9XCJjb2x1bW5cIj5cclxuICAgIDxzdmVsdGU6Y29tcG9uZW50IHRoaXM9e3ZpZXdzW2N1cnJlbnRWaWV3XX0gLz5cclxuICA8L2Rpdj5cclxuPC9kaXY+XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiIn0= */";
	append(document.head, style);
}

function create_fragment(ctx) {
	var div2, div0, t, div1, current;

	var menu = new ctx.Menu({
		props: { currentView: ctx.currentView },
		$$inline: true
	});
	menu.$on("message", ctx.handleMenuChange);

	var switch_value = ctx.views[ctx.currentView];

	function switch_props(ctx) {
		return { $$inline: true };
	}

	if (switch_value) {
		var switch_instance = new switch_value(switch_props(ctx));
	}

	return {
		c: function create() {
			div2 = element("div");
			div0 = element("div");
			menu.$$.fragment.c();
			t = space();
			div1 = element("div");
			if (switch_instance) switch_instance.$$.fragment.c();
			attr(div0, "class", "column col-auto");
			add_location(div0, file, 39, 2, 1017);
			attr(div1, "class", "column");
			add_location(div1, file, 42, 2, 1118);
			attr(div2, "class", "columns");
			add_location(div2, file, 38, 0, 992);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div0);
			mount_component(menu, div0, null);
			append(div2, t);
			append(div2, div1);

			if (switch_instance) {
				mount_component(switch_instance, div1, null);
			}

			current = true;
		},

		p: function update(changed, ctx) {
			var menu_changes = {};
			if (changed.currentView) menu_changes.currentView = ctx.currentView;
			menu.$set(menu_changes);

			if (switch_value !== (switch_value = ctx.views[ctx.currentView])) {
				if (switch_instance) {
					group_outros();
					const old_component = switch_instance;
					transition_out(old_component.$$.fragment, 1, 0, () => {
						destroy_component(old_component, 1);
					});
					check_outros();
				}

				if (switch_value) {
					switch_instance = new switch_value(switch_props(ctx));

					switch_instance.$$.fragment.c();
					transition_in(switch_instance.$$.fragment, 1);
					mount_component(switch_instance, div1, null);
				} else {
					switch_instance = null;
				}
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(menu.$$.fragment, local);

			if (switch_instance) transition_in(switch_instance.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(menu.$$.fragment, local);
			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div2);
			}

			destroy_component(menu);

			if (switch_instance) destroy_component(switch_instance);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const Menu = require("./Menu.svelte");
  const IdentityAndConnection = require("./IdentityAndConnection.svelte");
  const DisplayPreferences = require("./DisplayPreferences.svelte");
  const Filters = require("./Filters.svelte");
  const ContentWarnings = require("./ContentWarnings.svelte");
  const PlatformDAT = require("./PlatformDAT.svelte");
  const PlatformIPFS = require("./PlatformIPFS.svelte");

  const views = {
    identityAndConnection: IdentityAndConnection,
    displayPreferences: DisplayPreferences,
    filters: Filters,
    contentWarnings: ContentWarnings,
    platformDAT: PlatformDAT,
    platformIPFS: PlatformIPFS
  };

  let currentView = "identityAndConnection";

  const handleMenuChange = ev => {
    $$invalidate('currentView', currentView = ev.detail.currentView);
  };

	return {
		Menu,
		views,
		currentView,
		handleMenuChange
	};
}

class Settings extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-1e0jkdi-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Settings;

},{"./ContentWarnings.svelte":39,"./DisplayPreferences.svelte":40,"./Filters.svelte":41,"./IdentityAndConnection.svelte":42,"./Menu.svelte":43,"./PlatformDAT.svelte":44,"./PlatformIPFS.svelte":45,"svelte/internal":8}],47:[function(require,module,exports){
/* Thread.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	append,
	attr,
	check_outros,
	component_subscribe,
	destroy_component,
	detach,
	element,
	empty,
	group_outros,
	init,
	insert,
	mount_component,
	noop,
	outro_and_destroy_block,
	safe_not_equal,
	set_data,
	space,
	text,
	transition_in,
	transition_out,
	update_keyed_each,
	validate_store
} = require("svelte/internal");

const file = "Thread.svelte";

function get_each_context(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.msg = list[i];
	return child_ctx;
}

// (36:0) {#if error}
function create_if_block_1(ctx) {
	var div, t0, a, t1, a_href_value, t2, t3;

	return {
		c: function create() {
			div = element("div");
			t0 = text("Couldn't load thead\r\n    ");
			a = element("a");
			t1 = text(ctx.msgid);
			t2 = text("\r\n    : ");
			t3 = text(ctx.error);
			attr(a, "href", a_href_value = "?thread=" + ctx.msgid + "#/thread");
			add_location(a, file, 38, 4, 854);
			attr(div, "class", "toast toast-error");
			add_location(div, file, 36, 2, 792);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, a);
			append(a, t1);
			append(div, t2);
			append(div, t3);
		},

		p: function update(changed, ctx) {
			if (changed.msgid) {
				set_data(t1, ctx.msgid);
			}

			if ((changed.msgid) && a_href_value !== (a_href_value = "?thread=" + ctx.msgid + "#/thread")) {
				attr(a, "href", a_href_value);
			}

			if (changed.error) {
				set_data(t3, ctx.error);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (45:0) {:else}
function create_else_block(ctx) {
	var each_blocks = [], each_1_lookup = new Map(), each_1_anchor, current;

	var each_value = ctx.msgs;

	const get_key = ctx => ctx.msg.key;

	for (var i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c: function create() {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();

			each_1_anchor = empty();
		},

		m: function mount(target, anchor) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(target, anchor);

			insert(target, each_1_anchor, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			const each_value = ctx.msgs;

			group_outros();
			each_blocks = update_keyed_each(each_blocks, changed, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block, each_1_anchor, get_each_context);
			check_outros();
		},

		i: function intro(local) {
			if (current) return;
			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o: function outro(local) {
			for (i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d: function destroy(detaching) {
			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d(detaching);

			if (detaching) {
				detach(each_1_anchor);
			}
		}
	};
}

// (43:0) {#if !msgs && !error}
function create_if_block(ctx) {
	var div;

	return {
		c: function create() {
			div = element("div");
			attr(div, "class", "loading loading-lg");
			add_location(div, file, 43, 2, 958);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
		},

		p: noop,
		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (46:2) {#each msgs as msg (msg.key)}
function create_each_block(key_1, ctx) {
	var first, current;

	var messagerenderer = new ctx.MessageRenderer({
		props: { msg: ctx.msg },
		$$inline: true
	});

	return {
		key: key_1,

		first: null,

		c: function create() {
			first = empty();
			messagerenderer.$$.fragment.c();
			this.first = first;
		},

		m: function mount(target, anchor) {
			insert(target, first, anchor);
			mount_component(messagerenderer, target, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			var messagerenderer_changes = {};
			if (changed.msgs) messagerenderer_changes.msg = ctx.msg;
			messagerenderer.$set(messagerenderer_changes);
		},

		i: function intro(local) {
			if (current) return;
			transition_in(messagerenderer.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(messagerenderer.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(first);
			}

			destroy_component(messagerenderer, detaching);
		}
	};
}

function create_fragment(ctx) {
	var div, h4, t0, small, t1, t2, t3, current_block_type_index, if_block1, if_block1_anchor, current;

	var if_block0 = (ctx.error) && create_if_block_1(ctx);

	var if_block_creators = [
		create_if_block,
		create_else_block
	];

	var if_blocks = [];

	function select_block_type(ctx) {
		if (!ctx.msgs && !ctx.error) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c: function create() {
			div = element("div");
			h4 = element("h4");
			t0 = text("Thread\r\n    ");
			small = element("small");
			t1 = text(ctx.msgid);
			t2 = space();
			if (if_block0) if_block0.c();
			t3 = space();
			if_block1.c();
			if_block1_anchor = empty();
			attr(small, "class", "label hide-sm");
			add_location(small, file, 32, 4, 714);
			add_location(h4, file, 30, 2, 692);
			attr(div, "class", "container");
			add_location(div, file, 29, 0, 665);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, h4);
			append(h4, t0);
			append(h4, small);
			append(small, t1);
			insert(target, t2, anchor);
			if (if_block0) if_block0.m(target, anchor);
			insert(target, t3, anchor);
			if_blocks[current_block_type_index].m(target, anchor);
			insert(target, if_block1_anchor, anchor);
			current = true;
		},

		p: function update(changed, ctx) {
			if (!current || changed.msgid) {
				set_data(t1, ctx.msgid);
			}

			if (ctx.error) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(t3.parentNode, t3);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block1 = if_blocks[current_block_type_index];
				if (!if_block1) {
					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block1.c();
				}
				transition_in(if_block1, 1);
				if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(if_block1);
			current = true;
		},

		o: function outro(local) {
			transition_out(if_block1);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
				detach(t2);
			}

			if (if_block0) if_block0.d(detaching);

			if (detaching) {
				detach(t3);
			}

			if_blocks[current_block_type_index].d(detaching);

			if (detaching) {
				detach(if_block1_anchor);
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $routeParams;

	const MessageRenderer = require("../messageTypes/MessageRenderer.svelte");
  const { navigate, routeParams } = require("../utils.js"); validate_store(routeParams, 'routeParams'); component_subscribe($$self, routeParams, $$value => { $routeParams = $$value; $$invalidate('$routeParams', $routeParams) });
  let msgs = false;
  let error = false;
  let msgid;

	$$self.$$.update = ($$dirty = { $routeParams: 1, msgid: 1 }) => {
		if ($$dirty.$routeParams || $$dirty.msgid) { {
        $$invalidate('msgid', msgid = $routeParams.thread);
        if (msgid.startsWith("ssb:")) {
          $$invalidate('msgid', msgid = msgid.replace("ssb:", ""));
        }
        document.title = `Patchfox - Thread: ${msgid}`;
    
        let promise = ssb
          .thread(msgid)
          .then(ms => {
            $$invalidate('msgs', msgs = ms);
            window.scrollTo(0, 0);
          })
          .catch(n => {
            console.dir(n);
            $$invalidate('error', error = n.message);
          });
      } }
	};

	return {
		MessageRenderer,
		routeParams,
		msgs,
		error,
		msgid
	};
}

class Thread extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Thread;

},{"../messageTypes/MessageRenderer.svelte":21,"../utils.js":30,"svelte/internal":8}],48:[function(require,module,exports){
/* Compose.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	HtmlTag,
	SvelteComponentDev,
	add_location,
	add_render_callback,
	append,
	attr,
	check_outros,
	component_subscribe,
	create_in_transition,
	create_out_transition,
	destroy_component,
	detach,
	element,
	empty,
	globals,
	group_outros,
	init,
	insert,
	listen,
	mount_component,
	noop,
	prevent_default,
	run_all,
	safe_not_equal,
	set_data,
	space,
	stop_propagation,
	text,
	toggle_class,
	transition_in,
	transition_out,
	validate_store
} = require("svelte/internal");

const { document: document_1 } = globals;

const file = "Compose.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-olsuyr-style';
	style.textContent = ".file-on-top.svelte-olsuyr{border:solid 2px rgb(26, 192, 11)}input[type=\"file\"].svelte-olsuyr{display:none}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ29tcG9zZS5zdmVsdGUiLCJzb3VyY2VzIjpbIkNvbXBvc2Uuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XHJcbiAgY29uc3QgeyBvbk1vdW50IH0gPSByZXF1aXJlKFwic3ZlbHRlXCIpO1xyXG4gIGNvbnN0IGRyb3AgPSByZXF1aXJlKFwiZHJhZy1hbmQtZHJvcC1maWxlc1wiKTtcclxuICBjb25zdCB7IHNsaWRlIH0gPSByZXF1aXJlKFwic3ZlbHRlL3RyYW5zaXRpb25cIik7XHJcbiAgY29uc3QgeyBuYXZpZ2F0ZSwgcm91dGVQYXJhbXMsIHJlY29ubmVjdCB9ID0gcmVxdWlyZShcIi4uLy4uL3V0aWxzLmpzXCIpO1xyXG4gIGNvbnN0IHsgZ2V0UHJlZiB9ID0gcmVxdWlyZShcIi4uLy4uL3ByZWZzLmpzXCIpO1xyXG4gIGNvbnN0IEF2YXRhckNoaXAgPSByZXF1aXJlKFwiLi4vLi4vcGFydHMvQXZhdGFyQ2hpcC5zdmVsdGVcIik7XHJcblxyXG4gIGxldCBzaG93UHJldmlldyA9IGZhbHNlO1xyXG4gIGxldCBtc2cgPSBmYWxzZTtcclxuICBsZXQgZXJyb3IgPSBmYWxzZTtcclxuICBsZXQgcG9zdGluZyA9IGZhbHNlO1xyXG5cclxuICBsZXQgcm9vdCA9ICRyb3V0ZVBhcmFtcy5yb290O1xyXG4gIGxldCBicmFuY2ggPSAkcm91dGVQYXJhbXMuYnJhbmNoO1xyXG4gIGxldCBjaGFubmVsID0gJHJvdXRlUGFyYW1zLmNoYW5uZWwgfHwgXCJcIjtcclxuICBsZXQgY29udGVudCA9ICRyb3V0ZVBhcmFtcy5jb250ZW50IHx8IFwiXCI7XHJcbiAgbGV0IHJlcGx5ZmVlZCA9ICRyb3V0ZVBhcmFtcy5yZXBseWZlZWQgfHwgZmFsc2U7XHJcbiAgbGV0IGZvcmsgPSAkcm91dGVQYXJhbXMuZm9yaztcclxuICBsZXQgZmlsZU9uVG9wID0gZmFsc2U7XHJcbiAgbGV0IHB1bGwgPSBoZXJtaWVib3gubW9kdWxlcy5wdWxsU3RyZWFtO1xyXG4gIGxldCBmaWxlUmVhZGVyID0gaGVybWllYm94Lm1vZHVsZXMucHVsbEZpbGVSZWFkZXI7XHJcbiAgbGV0IHNib3QgPSBoZXJtaWVib3guc2JvdDtcclxuICBsZXQgaXBmc0RhZW1vblJ1bm5pbmcgPSBmYWxzZTtcclxuICBsZXQgZGF0RGFlbW9uUnVubmluZyA9IGZhbHNlO1xyXG5cclxuICBkb2N1bWVudC50aXRsZSA9IGBQYXRjaGZveCAtIGNvbXBvc2VgO1xyXG5cclxuICBvbk1vdW50KCgpID0+IHtcclxuICAgIGVycm9yID0gZmFsc2U7XHJcbiAgICBtc2cgPSBcIlwiO1xyXG5cclxuICAgIC8vIHRoaXMgY29kZSBjb3VsZCBiZSBpbiBzb21lIGJldHRlci9zbWFydGVyIHBsYWNlLlxyXG4gICAgLy8gZS5kYXRhVHJhbnNmZXIuZ2V0RGF0YSgndXJsJyk7IGZyb20gaW1hZ2VzIGluIHRoZSBicm93c2VyIHdpbmRvd1xyXG5cclxuICAgIGRyb3AoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb250ZW50XCIpLCBmaWxlcyA9PiByZWFkRmlsZUFuZEF0dGFjaChmaWxlcykpO1xyXG4gICAgY2hlY2tJcGZzRGFlbW9uKCk7XHJcbiAgICBjaGVja0RhdERhZW1vbigpO1xyXG4gIH0pO1xyXG5cclxuICBjb25zdCBjaGVja0lwZnNEYWVtb24gPSAoKSA9PiB7XHJcbiAgICBsZXQgcG9ydCA9IGdldFByZWYoXCJpcGZzUG9ydFwiLCA1MDAxKTtcclxuICAgIGZldGNoKGBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vYXBpL3YwL2NvbmZpZy9zaG93YCkudGhlbihkYXRhID0+IHtcclxuICAgICAgaXBmc0RhZW1vblJ1bm5pbmcgPSB0cnVlO1xyXG4gICAgfSk7XHJcbiAgfTtcclxuXHJcbiAgIGNvbnN0IGNoZWNrRGF0RGFlbW9uID0gKCkgPT4ge1xyXG4gICAgICBkYXREYWVtb25SdW5uaW5nID0gZmFsc2U7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgcmVhZEZpbGVBbmRBdHRhY2ggPSBmaWxlcyA9PiB7XHJcbiAgICBlcnJvciA9IGZhbHNlO1xyXG4gICAgbXNnID0gXCJcIjtcclxuXHJcbiAgICBpZiAoZmlsZXMubGVuZ3RoID09IDApIHtcclxuICAgICAgZmlsZU9uVG9wID0gZmFsc2U7XHJcbiAgICAgIGNvbnNvbGUubG9nKFwidGhpcyBpcyBub3QgYSBmaWxlXCIpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGZpcnN0ID0gZmlsZXNbMF07XHJcbiAgICBjb25zb2xlLmxvZyhmaXJzdCk7XHJcblxyXG4gICAgaWYgKCFmaXJzdC50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZVwiKSkge1xyXG4gICAgICBlcnJvciA9IHRydWU7XHJcbiAgICAgIG1zZyA9IGBZb3UgY2FuIG9ubHkgZHJhZyAmIGRyb3AgaW1hZ2UsIHRoaXMgZmlsZSBpcyBhICR7Zmlyc3QudHlwZX1gO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGZpcnN0LnNpemUgPj0gNTAwMDAwMCkge1xyXG4gICAgICBlcnJvciA9IHRydWU7XHJcbiAgICAgIG1zZyA9IGBGaWxlIHRvbyBsYXJnZTogJHtNYXRoLmZsb29yKFxyXG4gICAgICAgIGZpcnN0LnNpemUgLyAxMDQ4NTc2LFxyXG4gICAgICAgIDJcclxuICAgICAgKX1tYiB3aGVuIG1heCBzaXplIGlzIDVtYmA7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWxsKFxyXG4gICAgICBmaWxlUmVhZGVyKGZpcnN0KSxcclxuICAgICAgc2JvdC5ibG9icy5hZGQoZnVuY3Rpb24oZXJyLCBoYXNoKSB7XHJcbiAgICAgICAgLy8gJ2hhc2gnIGlzIHRoZSBoYXNoLWlkIG9mIHRoZSBibG9iXHJcbiAgICAgICAgaWYgKGVycikge1xyXG4gICAgICAgICAgZXJyb3IgPSB0cnVlO1xyXG4gICAgICAgICAgbXNnID0gXCJDb3VsZG4ndCBhdHRhY2ggZmlsZTogXCIgKyBlcnI7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbnRlbnQgKz0gYCAhWyR7Zmlyc3QubmFtZX1dKCR7aGFzaH0pYDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZmlsZU9uVG9wID0gZmFsc2U7XHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IHBvc3QgPSBhc3luYyBldiA9PiB7XHJcbiAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcblxyXG4gICAgaWYgKCFwb3N0aW5nKSB7XHJcbiAgICAgIHBvc3RpbmcgPSB0cnVlO1xyXG5cclxuICAgICAgaWYgKGNoYW5uZWwuc3RhcnRzV2l0aChcIiNcIikpIHtcclxuICAgICAgICBjaGFubmVsID0gY2hhbm5lbC5zbGljZSgxKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdHJ5IHtcclxuICAgICAgICBtc2cgPSBhd2FpdCBzc2IubmV3UG9zdCh7XHJcbiAgICAgICAgICB0ZXh0OiBjb250ZW50LFxyXG4gICAgICAgICAgY2hhbm5lbCxcclxuICAgICAgICAgIHJvb3QsXHJcbiAgICAgICAgICBicmFuY2gsXHJcbiAgICAgICAgICBmb3JrLFxyXG4gICAgICAgICAgY29udGVudFdhcm5pbmc6IGNvbnRlbnRXYXJuaW5nLmxlbmd0aCA+IDAgPyBjb250ZW50V2FybmluZyA6IHVuZGVmaW5lZFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHBvc3RpbmcgPSBmYWxzZTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcInBvc3RlZFwiLCBtc2cpO1xyXG4gICAgICAgIHdpbmRvdy5zY3JvbGxUbygwLCAwKTtcclxuICAgICAgfSBjYXRjaCAobikge1xyXG4gICAgICAgIGVycm9yID0gdHJ1ZTtcclxuICAgICAgICBtc2cgPSBgQ291bGRuJ3QgcG9zdCB5b3VyIG1lc3NhZ2U6ICR7bn1gO1xyXG4gICAgICAgIHdpbmRvdy5zY3JvbGxUbygwLCAwKTtcclxuXHJcbiAgICAgICAgaWYgKG1zZy5tZXNzYWdlID09IFwic3RyZWFtIGlzIGNsb3NlZFwiKSB7XHJcbiAgICAgICAgICBtc2cgKz0gXCIuIFdlIGxvc3QgY29ubmVjdGlvbiB0byBzYm90LiBXZSdsbCB0cnkgdG8gcmVzdGFibGlzaCBpdC4uLlwiO1xyXG5cclxuICAgICAgICAgIHJlY29ubmVjdCgpXHJcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICBzaG93UHJldmlldyA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgIHBvc3RpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgICBlcnJvciA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgIG1zZyA9IFwiQ29ubmVjdGlvbiB0byBzYm90IHJlZXN0YWJsaXNoZWQuIFRyeSBwb3N0aW5nIGFnYWluXCI7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xyXG4gICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5zZWFyY2ggPSBgP3Jvb3Q9JHtlbmNvZGVVUklDb21wb25lbnQoXHJcbiAgICAgICAgICAgICAgICByb290XHJcbiAgICAgICAgICAgICAgKX0mYnJhbmNoPSR7ZW5jb2RlVVJJQ29tcG9uZW50KFxyXG4gICAgICAgICAgICAgICAgYnJhbmNoXHJcbiAgICAgICAgICAgICAgKX0mY29udGVudD0ke2VuY29kZVVSSUNvbXBvbmVudChcclxuICAgICAgICAgICAgICAgIGNvbnRlbnRcclxuICAgICAgICAgICAgICApfSZjaGFubmVsPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGNoYW5uZWwpfWA7XHJcbiAgICAgICAgICAgICAgbXNnID0gYFNvcnJ5LCBjb3VsZG4ndCByZWNvbm5lY3QgdG8gc2JvdDoke2Vycn0uIFRyeSByZWxvYWRpbmcgdGhlIHBhZ2UuIFlvdXIgY29udGVudCBoYXMgYmVlbiBzYXZlZCB0byB0aGUgVVJMYDtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgcHJldmlldyA9IGV2ID0+IHtcclxuICAgIHNob3dQcmV2aWV3ID0gdHJ1ZTtcclxuICB9O1xyXG5cclxuICBjb25zdCBzYXZlVG9VUkwgPSBldiA9PiB7XHJcbiAgICB3aW5kb3cubG9jYXRpb24uc2VhcmNoID0gYD9yb290PSR7ZW5jb2RlVVJJQ29tcG9uZW50KFxyXG4gICAgICByb290XHJcbiAgICApfSZicmFuY2g9JHtlbmNvZGVVUklDb21wb25lbnQoYnJhbmNoKX0mY29udGVudD0ke2VuY29kZVVSSUNvbXBvbmVudChcclxuICAgICAgY29udGVudFxyXG4gICAgKX0mY2hhbm5lbD0ke2VuY29kZVVSSUNvbXBvbmVudChjaGFubmVsKX1gO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGF2YXRhckNsaWNrID0gZXYgPT4ge1xyXG4gICAgbGV0IGZlZWQgPSBldi5kZXRhaWwuZmVlZDtcclxuICAgIGxldCBuYW1lID0gZXYuZGV0YWlsLm5hbWU7XHJcblxyXG4gICAgaWYgKGNvbnRlbnQubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb250ZW50ICs9IGAgWyR7bmFtZX1dKCR7ZmVlZH0pYDtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnRlbnQgPSBgWyR7bmFtZX1dKCR7ZmVlZH0pYDtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBkcmFnT3ZlciA9IGV2ID0+IHtcclxuICAgIGZpbGVPblRvcCA9IHRydWU7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgZHJhZ0xlYXZlID0gZXYgPT4ge1xyXG4gICAgZmlsZU9uVG9wID0gZmFsc2U7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYXR0YWNoRmlsZVRyaWdnZXIgPSAoKSA9PiB7XHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZpbGVJbnB1dFwiKS5jbGljaygpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGF0dGFjaEZpbGVJUEZTVHJpZ2dlciA9ICgpID0+IHtcclxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmlsZUlucHV0SVBGU1wiKS5jbGljaygpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGF0dGFjaEZpbGVEQVRUcmlnZ2VyID0gKCkgPT4ge1xyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmaWxlSW5wdXREQVRcIikuY2xpY2soKTtcclxuICB9O1xyXG5cclxuICBjb25zdCBhdHRhY2hGaWxlID0gZXYgPT4ge1xyXG4gICAgY29uc3QgZmlsZXMgPSBldi50YXJnZXQuZmlsZXM7XHJcbiAgICByZWFkRmlsZUFuZEF0dGFjaChmaWxlcyk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYXR0YWNoRmlsZUlQRlMgPSBldiA9PiB7XHJcbiAgICBjb25zdCBmaWxlcyA9IGV2LnRhcmdldC5maWxlcztcclxuICAgIHJlYWRGaWxlQW5kQXR0YWNoSVBGUyhmaWxlcyk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYXR0YWNoRmlsZURBVCA9IGV2ID0+IHtcclxuICAgIGNvbnN0IGZpbGVzID0gZXYudGFyZ2V0LmZpbGVzO1xyXG4gICAgcmVhZEZpbGVBbmRBdHRhY2hEQVQoZmlsZXMpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IHJlYWRGaWxlQW5kQXR0YWNoSVBGUyA9IGFzeW5jIGZpbGVzID0+IHtcclxuICAgIGVycm9yID0gZmFsc2U7XHJcbiAgICBtc2cgPSBcIlwiO1xyXG5cclxuICAgIHZhciBpcGZzID0gd2luZG93LklwZnNIdHRwQ2xpZW50KFwiMTI3LjAuMC4xXCIsIFwiNTAwMVwiKTtcclxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBpcGZzLmFkZChmaWxlc1swXSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coXCJhZGRlZCB2aWEgSVBGU1wiLCByZXN1bHRzKTtcclxuICAgIGNvbnRlbnQgKz0gYCBbJHtyZXN1bHRzWzBdLnBhdGh9XShpcGZzOi8vJHtyZXN1bHRzWzBdLmhhc2h9KWA7XHJcbiAgfTtcclxuXHJcbiAgbGV0IHNob3dDb250ZW50V2FybmluZ0ZpZWxkID0gZmFsc2U7XHJcblxyXG4gIGNvbnN0IHRvZ2dsZUNvbnRlbnRXYXJuaW5nID0gKCkgPT5cclxuICAgIChzaG93Q29udGVudFdhcm5pbmdGaWVsZCA9ICFzaG93Q29udGVudFdhcm5pbmdGaWVsZCk7XHJcblxyXG4gIGxldCBjb250ZW50V2FybmluZyA9IFwiXCI7XHJcbjwvc2NyaXB0PlxyXG5cclxuPHN0eWxlPlxyXG4gIC5maWxlLW9uLXRvcCB7XHJcbiAgICBib3JkZXI6IHNvbGlkIDJweCByZ2IoMjYsIDE5MiwgMTEpO1xyXG4gIH1cclxuXHJcbiAgaW5wdXRbdHlwZT1cImZpbGVcIl0ge1xyXG4gICAgZGlzcGxheTogbm9uZTtcclxuICB9XHJcbjwvc3R5bGU+XHJcblxyXG48ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgPGRpdiBjbGFzcz1cImNvbHVtbnNcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2x1bW5cIj5cclxuICAgICAgeyNpZiBmb3JrfVxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJ0b2FzdCB0b2FzdC13YXJuaW5nXCI+WW91IGFyZSBmb3JraW5nOiB7Zm9ya308L2Rpdj5cclxuICAgICAgey9pZn1cclxuICAgICAgeyNpZiBtc2d9XHJcbiAgICAgICAgeyNpZiBlcnJvcn1cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJ0b2FzdCB0b2FzdC1lcnJvclwiPnttc2d9PC9kaXY+XHJcbiAgICAgICAgezplbHNlfVxyXG4gICAgICAgICAgPGRpdiBjbGFzcz1cInRvYXN0IHRvYXN0LXN1Y2Nlc3NcIj5cclxuICAgICAgICAgICAgWW91ciBtZXNzYWdlIGhhcyBiZWVuIHBvc3RlZC4gRG8geW91IHdhbnQgdG9cclxuICAgICAgICAgICAgPGFcclxuICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIlxyXG4gICAgICAgICAgICAgIGhyZWY9XCI/dGhyZWFkPXtlbmNvZGVVUklDb21wb25lbnQobXNnLmtleSl9Iy90aHJlYWRcIj5cclxuICAgICAgICAgICAgICBDaGVjayBpdCBvdXQ/XHJcbiAgICAgICAgICAgIDwvYT5cclxuICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIHsvaWZ9XHJcbiAgICAgIHsvaWZ9XHJcbiAgICAgIHsjaWYgIXNob3dQcmV2aWV3fVxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwXCIgaW46c2xpZGUgb3V0OnNsaWRlPlxyXG4gICAgICAgICAgPGxhYmVsIGNsYXNzPVwiZm9ybS1sYWJlbFwiIGZvcj1cImNoYW5uZWxcIj5DaGFubmVsPC9sYWJlbD5cclxuICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICBjbGFzcz1cImZvcm0taW5wdXRcIlxyXG4gICAgICAgICAgICB0eXBlPVwidGV4dFwiXHJcbiAgICAgICAgICAgIGlkPVwiY2hhbm5lbFwiXHJcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiY2hhbm5lbFwiXHJcbiAgICAgICAgICAgIGJpbmQ6dmFsdWU9e2NoYW5uZWx9IC8+XHJcblxyXG4gICAgICAgICAgeyNpZiBicmFuY2h9XHJcbiAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImZvcm0tbGFiZWxcIiBmb3I9XCJyZXBseS10b1wiPkluIHJlcGx5IHRvPC9sYWJlbD5cclxuICAgICAgICAgICAgPGlucHV0XHJcbiAgICAgICAgICAgICAgY2xhc3M9XCJmb3JtLWlucHV0XCJcclxuICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXHJcbiAgICAgICAgICAgICAgaWQ9XCJyZXBseS10b1wiXHJcbiAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCJpbiByZXBseSB0b1wiXHJcbiAgICAgICAgICAgICAgYmluZDp2YWx1ZT17YnJhbmNofSAvPlxyXG4gICAgICAgICAgey9pZn1cclxuXHJcbiAgICAgICAgICB7I2lmIHJlcGx5ZmVlZH1cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm10LTJcIj5cclxuICAgICAgICAgICAgICA8c3Bhbj5cclxuICAgICAgICAgICAgICAgIENsaWNrIHRoZSBhdmF0YXIgdG8gYWRkIGEgbGluayB0byB0aGUgbWVzc2FnZTpcclxuICAgICAgICAgICAgICAgIDxBdmF0YXJDaGlwIGZlZWQ9e3JlcGx5ZmVlZH0gb246YXZhdGFyQ2xpY2s9e2F2YXRhckNsaWNrfSAvPlxyXG4gICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICB7L2lmfVxyXG4gICAgICAgICAgPGxhYmVsIGNsYXNzPVwiZm9ybS1sYWJlbFwiIGZvcj1cImNvbnRlbnRcIj5NZXNzYWdlPC9sYWJlbD5cclxuICAgICAgICAgIDx0ZXh0YXJlYVxyXG4gICAgICAgICAgICBjbGFzcz1cImZvcm0taW5wdXRcIlxyXG4gICAgICAgICAgICBpZD1cImNvbnRlbnRcIlxyXG4gICAgICAgICAgICBwbGFjZWhvbGRlcj1cIlR5cGUgaW4geW91ciBwb3N0XCJcclxuICAgICAgICAgICAgcm93cz1cIjEwXCJcclxuICAgICAgICAgICAgb246ZHJhZ292ZXJ8cHJldmVudERlZmF1bHR8c3RvcFByb3BhZ2F0aW9uPXtkcmFnT3Zlcn1cclxuICAgICAgICAgICAgb246ZHJhZ2xlYXZlfHByZXZlbnREZWZhdWx0fHN0b3BQcm9wYWdhdGlvbj17ZHJhZ0xlYXZlfVxyXG4gICAgICAgICAgICBjbGFzczpmaWxlLW9uLXRvcD17ZmlsZU9uVG9wfVxyXG4gICAgICAgICAgICBiaW5kOnZhbHVlPXtjb250ZW50fSAvPlxyXG4gICAgICAgICAgPGRpdiBjbGFzcz1cImQtYmxvY2sgbS0yXCI+XHJcbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWxpbmtcIiBvbjpjbGljaz17dG9nZ2xlQ29udGVudFdhcm5pbmd9PlxyXG4gICAgICAgICAgICAgIENXXHJcbiAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICB7I2lmIHNob3dDb250ZW50V2FybmluZ0ZpZWxkfVxyXG4gICAgICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICAgICAgdHlwZT1cInRleHRcIlxyXG4gICAgICAgICAgICAgICAgc2l6ZT1cIjUwXCJcclxuICAgICAgICAgICAgICAgIGJpbmQ6dmFsdWU9e2NvbnRlbnRXYXJuaW5nfVxyXG4gICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCJEZXNjcmliZSB5b3VyIGNvbnRlbnQgd2FybmluZyAobGVhdmUgZW1wdHkgdG8gbm8gdXNlIGl0KVwiIC8+XHJcbiAgICAgICAgICAgIHsvaWZ9XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgIDxpbnB1dCB0eXBlPVwiZmlsZVwiIG9uOmlucHV0PXthdHRhY2hGaWxlfSBpZD1cImZpbGVJbnB1dFwiIC8+XHJcbiAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuXCIgb246Y2xpY2s9e2F0dGFjaEZpbGVUcmlnZ2VyfT5BdHRhY2ggRmlsZTwvYnV0dG9uPlxyXG4gICAgICAgICAgeyNpZiBnZXRQcmVmKFwicGxhdGZvcm0taXBmcy1lbmFibGVkXCIsIFwieWVzXCIpID09PSBcInllc1wiICYmIGlwZnNEYWVtb25SdW5uaW5nfVxyXG4gICAgICAgICAgICA8aW5wdXQgdHlwZT1cImZpbGVcIiBvbjppbnB1dD17YXR0YWNoRmlsZUlQRlN9IGlkPVwiZmlsZUlucHV0SVBGU1wiIC8+XHJcbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG5cIiBvbjpjbGljaz17YXR0YWNoRmlsZUlQRlNUcmlnZ2VyfT5cclxuICAgICAgICAgICAgICBBdHRhY2ggRmlsZSB1c2luZyBJUEZTXHJcbiAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgey9pZn1cclxuICAgICAgICAgICB7I2lmIGdldFByZWYoXCJwbGF0Zm9ybS1kYXQtZW5hYmxlZFwiLCBcInllc1wiKSA9PT0gXCJ5ZXNcIiAmJiBkYXREYWVtb25SdW5uaW5nfVxyXG4gICAgICAgICAgICA8aW5wdXQgdHlwZT1cImZpbGVcIiBvbjppbnB1dD17YXR0YWNoRmlsZURBVH0gaWQ9XCJmaWxlSW5wdXREQVRcIiAvPlxyXG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuXCIgb246Y2xpY2s9e2F0dGFjaEZpbGVEQVRUcmlnZ2VyfT5cclxuICAgICAgICAgICAgICBBdHRhY2ggRmlsZSB1c2luZyBEYXRcclxuICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICB7L2lmfVxyXG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeSBmbG9hdC1yaWdodFwiIG9uOmNsaWNrPXtwcmV2aWV3fT5cclxuICAgICAgICAgICAgUHJldmlld1xyXG4gICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgIHs6ZWxzZX1cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiY29sdW1uIGNvbC1tZC0xMlwiPlxyXG4gICAgICAgICAgPGgyPlBvc3QgcHJldmlldzwvaDI+XHJcbiAgICAgICAgICB7I2lmIGNoYW5uZWwgfHwgcm9vdCB8fCBicmFuY2ggfHwgY29udGVudFdhcm5pbmcubGVuZ3RoID4gMH1cclxuICAgICAgICAgICAgPGJsb2NrcXVvdGU+XHJcbiAgICAgICAgICAgICAgeyNpZiBjaGFubmVsfVxyXG4gICAgICAgICAgICAgICAgPHA+XHJcbiAgICAgICAgICAgICAgICAgIDxiPkNoYW5uZWw6PC9iPlxyXG4gICAgICAgICAgICAgICAgICB7Y2hhbm5lbC5zdGFydHNXaXRoKCcjJykgPyBjaGFubmVsLnNsaWNlKDEpIDogY2hhbm5lbH1cclxuICAgICAgICAgICAgICAgIDwvcD5cclxuICAgICAgICAgICAgICB7L2lmfVxyXG4gICAgICAgICAgICAgIHsjaWYgcm9vdH1cclxuICAgICAgICAgICAgICAgIDxwPlxyXG4gICAgICAgICAgICAgICAgICA8Yj5Sb290OjwvYj5cclxuICAgICAgICAgICAgICAgICAge3Jvb3R9XHJcbiAgICAgICAgICAgICAgICA8L3A+XHJcbiAgICAgICAgICAgICAgey9pZn1cclxuICAgICAgICAgICAgICB7I2lmIGJyYW5jaH1cclxuICAgICAgICAgICAgICAgIDxwPlxyXG4gICAgICAgICAgICAgICAgICA8Yj5JbiBSZXBseSBUbzo8L2I+XHJcbiAgICAgICAgICAgICAgICAgIHticmFuY2h9XHJcbiAgICAgICAgICAgICAgICA8L3A+XHJcbiAgICAgICAgICAgICAgey9pZn1cclxuICAgICAgICAgICAgICB7I2lmIGNvbnRlbnRXYXJuaW5nLmxlbmd0aCA+IDB9XHJcbiAgICAgICAgICAgICAgICA8cD5cclxuICAgICAgICAgICAgICAgICAgPGI+Q29udGVudCBXYXJuaW5nOjwvYj5cclxuICAgICAgICAgICAgICAgICAge2NvbnRlbnRXYXJuaW5nfVxyXG4gICAgICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgICAgIHsvaWZ9XHJcbiAgICAgICAgICAgIDwvYmxvY2txdW90ZT5cclxuICAgICAgICAgIHsvaWZ9XHJcbiAgICAgICAgICB7QGh0bWwgc3NiLm1hcmtkb3duKGNvbnRlbnQpfVxyXG5cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJkaXZpZGVyXCIgLz5cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW5zXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW4gY29sLW1kLTEyIGNvbC1sZy0xMFwiPlxyXG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibGFiZWwgbGFiZWwtd2FybmluZ1wiPlxyXG4gICAgICAgICAgICAgICAgVGhpcyBtZXNzYWdlIHdpbGwgYmUgcHVibGljIGFuZCBjYW4ndCBiZSBlZGl0ZWQgb3IgZGVsZXRlZFxyXG4gICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW4gY29sLW1kLTEyIGNvbC1sZy0yXCI+XHJcbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0blwiIG9uOmNsaWNrPXsoKSA9PiAoc2hvd1ByZXZpZXcgPSBmYWxzZSl9PlxyXG4gICAgICAgICAgICAgICAgR28gQmFja1xyXG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgIDxidXR0b25cclxuICAgICAgICAgICAgICAgIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCJcclxuICAgICAgICAgICAgICAgIGNsYXNzOmxvYWRpbmc9e3Bvc3Rpbmd9XHJcbiAgICAgICAgICAgICAgICBkaXNhYmxlZD17IWVycm9yICYmIHR5cGVvZiBtc2cua2V5ID09IFwic3RyaW5nXCJ9XHJcbiAgICAgICAgICAgICAgICBvbjpjbGljaz17cG9zdH0+XHJcbiAgICAgICAgICAgICAgICBQb3N0XHJcbiAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgIHsvaWZ9XHJcbiAgICA8L2Rpdj5cclxuICA8L2Rpdj5cclxuPC9kaXY+XHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFpT0UsWUFBWSxjQUFDLENBQUMsQUFDWixNQUFNLENBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxBQUNwQyxDQUFDLEFBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBQyxDQUFDLEFBQ2xCLE9BQU8sQ0FBRSxJQUFJLEFBQ2YsQ0FBQyJ9 */";
	append(document_1.head, style);
}

// (238:6) {#if fork}
function create_if_block_13(ctx) {
	var div, t0, t1;

	return {
		c: function create() {
			div = element("div");
			t0 = text("You are forking: ");
			t1 = text(ctx.fork);
			attr(div, "class", "toast toast-warning");
			add_location(div, file, 238, 8, 6138);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
		},

		p: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (241:6) {#if msg}
function create_if_block_11(ctx) {
	var if_block_anchor;

	function select_block_type(ctx) {
		if (ctx.error) return create_if_block_12;
		return create_else_block_1;
	}

	var current_block_type = select_block_type(ctx);
	var if_block = current_block_type(ctx);

	return {
		c: function create() {
			if_block.c();
			if_block_anchor = empty();
		},

		m: function mount(target, anchor) {
			if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
		},

		p: function update(changed, ctx) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(changed, ctx);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);
				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},

		d: function destroy(detaching) {
			if_block.d(detaching);

			if (detaching) {
				detach(if_block_anchor);
			}
		}
	};
}

// (244:8) {:else}
function create_else_block_1(ctx) {
	var div, t0, a, t1, a_href_value;

	return {
		c: function create() {
			div = element("div");
			t0 = text("Your message has been posted. Do you want to\r\n            ");
			a = element("a");
			t1 = text("Check it out?");
			attr(a, "target", "_blank");
			attr(a, "href", a_href_value = "?thread=" + ctx.encodeURIComponent(ctx.msg.key) + "#/thread");
			add_location(a, file, 246, 12, 6439);
			attr(div, "class", "toast toast-success");
			add_location(div, file, 244, 10, 6334);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, a);
			append(a, t1);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && a_href_value !== (a_href_value = "?thread=" + ctx.encodeURIComponent(ctx.msg.key) + "#/thread")) {
				attr(a, "href", a_href_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (242:8) {#if error}
function create_if_block_12(ctx) {
	var div, t;

	return {
		c: function create() {
			div = element("div");
			t = text(ctx.msg);
			attr(div, "class", "toast toast-error");
			add_location(div, file, 242, 10, 6263);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t);
		},

		p: function update(changed, ctx) {
			if (changed.msg) {
				set_data(t, ctx.msg);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (323:6) {:else}
function create_else_block(ctx) {
	var div4, h2, t1, t2, html_tag, raw_value = ctx.ssb.markdown(ctx.content), t3, div0, t4, div3, div1, span, t6, div2, button0, t8, button1, t9, button1_disabled_value, dispose;

	var if_block = (ctx.channel || ctx.root || ctx.branch || ctx.contentWarning.length > 0) && create_if_block_6(ctx);

	return {
		c: function create() {
			div4 = element("div");
			h2 = element("h2");
			h2.textContent = "Post preview";
			t1 = space();
			if (if_block) if_block.c();
			t2 = space();
			t3 = space();
			div0 = element("div");
			t4 = space();
			div3 = element("div");
			div1 = element("div");
			span = element("span");
			span.textContent = "This message will be public and can't be edited or deleted";
			t6 = space();
			div2 = element("div");
			button0 = element("button");
			button0.textContent = "Go Back";
			t8 = space();
			button1 = element("button");
			t9 = text("Post");
			add_location(h2, file, 324, 10, 9393);
			html_tag = new HtmlTag(raw_value, t3);
			attr(div0, "class", "divider");
			add_location(div0, file, 355, 10, 10310);
			attr(span, "class", "label label-warning");
			add_location(span, file, 358, 14, 10436);
			attr(div1, "class", "column col-md-12 col-lg-10");
			add_location(div1, file, 357, 12, 10380);
			attr(button0, "class", "btn");
			add_location(button0, file, 363, 14, 10658);
			attr(button1, "class", "btn btn-primary");
			button1.disabled = button1_disabled_value = !ctx.error && typeof ctx.msg.key == "string";
			toggle_class(button1, "loading", ctx.posting);
			add_location(button1, file, 366, 14, 10783);
			attr(div2, "class", "column col-md-12 col-lg-2");
			add_location(div2, file, 362, 12, 10603);
			attr(div3, "class", "columns");
			add_location(div3, file, 356, 10, 10345);
			attr(div4, "class", "column col-md-12");
			add_location(div4, file, 323, 8, 9351);

			dispose = [
				listen(button0, "click", ctx.click_handler),
				listen(button1, "click", ctx.post)
			];
		},

		m: function mount(target, anchor) {
			insert(target, div4, anchor);
			append(div4, h2);
			append(div4, t1);
			if (if_block) if_block.m(div4, null);
			append(div4, t2);
			html_tag.m(div4);
			append(div4, t3);
			append(div4, div0);
			append(div4, t4);
			append(div4, div3);
			append(div3, div1);
			append(div1, span);
			append(div3, t6);
			append(div3, div2);
			append(div2, button0);
			append(div2, t8);
			append(div2, button1);
			append(button1, t9);
		},

		p: function update(changed, ctx) {
			if (ctx.channel || ctx.root || ctx.branch || ctx.contentWarning.length > 0) {
				if (if_block) {
					if_block.p(changed, ctx);
				} else {
					if_block = create_if_block_6(ctx);
					if_block.c();
					if_block.m(div4, t2);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}

			if ((changed.content) && raw_value !== (raw_value = ctx.ssb.markdown(ctx.content))) {
				html_tag.p(raw_value);
			}

			if ((changed.error || changed.msg) && button1_disabled_value !== (button1_disabled_value = !ctx.error && typeof ctx.msg.key == "string")) {
				button1.disabled = button1_disabled_value;
			}

			if (changed.posting) {
				toggle_class(button1, "loading", ctx.posting);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(div4);
			}

			if (if_block) if_block.d();
			run_all(dispose);
		}
	};
}

// (255:6) {#if !showPreview}
function create_if_block(ctx) {
	var div1, label0, t1, input0, t2, t3, t4, label1, t6, textarea, t7, div0, button0, t9, t10, input1, t11, button1, t13, t14, t15, button2, div1_intro, div1_outro, current, dispose;

	var if_block0 = (ctx.branch) && create_if_block_5(ctx);

	var if_block1 = (ctx.replyfeed) && create_if_block_4(ctx);

	var if_block2 = (ctx.showContentWarningField) && create_if_block_3(ctx);

	var if_block3 = (ctx.getPref("platform-ipfs-enabled", "yes") === "yes" && ctx.ipfsDaemonRunning) && create_if_block_2(ctx);

	var if_block4 = (ctx.getPref("platform-dat-enabled", "yes") === "yes" && ctx.datDaemonRunning) && create_if_block_1(ctx);

	return {
		c: function create() {
			div1 = element("div");
			label0 = element("label");
			label0.textContent = "Channel";
			t1 = space();
			input0 = element("input");
			t2 = space();
			if (if_block0) if_block0.c();
			t3 = space();
			if (if_block1) if_block1.c();
			t4 = space();
			label1 = element("label");
			label1.textContent = "Message";
			t6 = space();
			textarea = element("textarea");
			t7 = space();
			div0 = element("div");
			button0 = element("button");
			button0.textContent = "CW";
			t9 = space();
			if (if_block2) if_block2.c();
			t10 = space();
			input1 = element("input");
			t11 = space();
			button1 = element("button");
			button1.textContent = "Attach File";
			t13 = space();
			if (if_block3) if_block3.c();
			t14 = space();
			if (if_block4) if_block4.c();
			t15 = space();
			button2 = element("button");
			button2.textContent = "Preview";
			attr(label0, "class", "form-label");
			attr(label0, "for", "channel");
			add_location(label0, file, 256, 10, 6725);
			attr(input0, "class", "form-input");
			attr(input0, "type", "text");
			attr(input0, "id", "channel");
			attr(input0, "placeholder", "channel");
			add_location(input0, file, 257, 10, 6792);
			attr(label1, "class", "form-label");
			attr(label1, "for", "content");
			add_location(label1, file, 282, 10, 7556);
			attr(textarea, "class", "form-input svelte-olsuyr");
			attr(textarea, "id", "content");
			attr(textarea, "placeholder", "Type in your post");
			attr(textarea, "rows", "10");
			toggle_class(textarea, "file-on-top", ctx.fileOnTop);
			add_location(textarea, file, 283, 10, 7623);
			attr(button0, "class", "btn btn-link");
			add_location(button0, file, 293, 12, 8025);
			attr(div0, "class", "d-block m-2");
			add_location(div0, file, 292, 10, 7986);
			attr(input1, "type", "file");
			attr(input1, "id", "fileInput");
			attr(input1, "class", "svelte-olsuyr");
			add_location(input1, file, 304, 10, 8433);
			attr(button1, "class", "btn");
			add_location(button1, file, 305, 10, 8503);
			attr(button2, "class", "btn btn-primary float-right");
			add_location(button2, file, 318, 10, 9205);
			attr(div1, "class", "form-group");
			add_location(div1, file, 255, 8, 6670);

			dispose = [
				listen(input0, "input", ctx.input0_input_handler),
				listen(textarea, "input", ctx.textarea_input_handler),
				listen(textarea, "dragover", stop_propagation(prevent_default(ctx.dragOver))),
				listen(textarea, "dragleave", stop_propagation(prevent_default(ctx.dragLeave))),
				listen(button0, "click", ctx.toggleContentWarning),
				listen(input1, "input", ctx.attachFile),
				listen(button1, "click", ctx.attachFileTrigger),
				listen(button2, "click", ctx.preview)
			];
		},

		m: function mount(target, anchor) {
			insert(target, div1, anchor);
			append(div1, label0);
			append(div1, t1);
			append(div1, input0);

			input0.value = ctx.channel;

			append(div1, t2);
			if (if_block0) if_block0.m(div1, null);
			append(div1, t3);
			if (if_block1) if_block1.m(div1, null);
			append(div1, t4);
			append(div1, label1);
			append(div1, t6);
			append(div1, textarea);

			textarea.value = ctx.content;

			append(div1, t7);
			append(div1, div0);
			append(div0, button0);
			append(div0, t9);
			if (if_block2) if_block2.m(div0, null);
			append(div1, t10);
			append(div1, input1);
			append(div1, t11);
			append(div1, button1);
			append(div1, t13);
			if (if_block3) if_block3.m(div1, null);
			append(div1, t14);
			if (if_block4) if_block4.m(div1, null);
			append(div1, t15);
			append(div1, button2);
			current = true;
		},

		p: function update(changed, ctx) {
			if (changed.channel && (input0.value !== ctx.channel)) input0.value = ctx.channel;

			if (ctx.branch) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_5(ctx);
					if_block0.c();
					if_block0.m(div1, t3);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.replyfeed) {
				if (if_block1) {
					if_block1.p(changed, ctx);
					transition_in(if_block1, 1);
				} else {
					if_block1 = create_if_block_4(ctx);
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(div1, t4);
				}
			} else if (if_block1) {
				group_outros();
				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});
				check_outros();
			}

			if (changed.content) textarea.value = ctx.content;

			if (changed.fileOnTop) {
				toggle_class(textarea, "file-on-top", ctx.fileOnTop);
			}

			if (ctx.showContentWarningField) {
				if (if_block2) {
					if_block2.p(changed, ctx);
				} else {
					if_block2 = create_if_block_3(ctx);
					if_block2.c();
					if_block2.m(div0, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (ctx.getPref("platform-ipfs-enabled", "yes") === "yes" && ctx.ipfsDaemonRunning) {
				if (!if_block3) {
					if_block3 = create_if_block_2(ctx);
					if_block3.c();
					if_block3.m(div1, t14);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}

			if (ctx.getPref("platform-dat-enabled", "yes") === "yes" && ctx.datDaemonRunning) {
				if (!if_block4) {
					if_block4 = create_if_block_1(ctx);
					if_block4.c();
					if_block4.m(div1, t15);
				}
			} else if (if_block4) {
				if_block4.d(1);
				if_block4 = null;
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(if_block1);

			add_render_callback(() => {
				if (div1_outro) div1_outro.end(1);
				if (!div1_intro) div1_intro = create_in_transition(div1, ctx.slide, {});
				div1_intro.start();
			});

			current = true;
		},

		o: function outro(local) {
			transition_out(if_block1);
			if (div1_intro) div1_intro.invalidate();

			div1_outro = create_out_transition(div1, ctx.slide, {});

			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div1);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			if (if_block4) if_block4.d();

			if (detaching) {
				if (div1_outro) div1_outro.end();
			}

			run_all(dispose);
		}
	};
}

// (326:10) {#if channel || root || branch || contentWarning.length > 0}
function create_if_block_6(ctx) {
	var blockquote, t0, t1, t2;

	var if_block0 = (ctx.channel) && create_if_block_10(ctx);

	var if_block1 = (ctx.root) && create_if_block_9(ctx);

	var if_block2 = (ctx.branch) && create_if_block_8(ctx);

	var if_block3 = (ctx.contentWarning.length > 0) && create_if_block_7(ctx);

	return {
		c: function create() {
			blockquote = element("blockquote");
			if (if_block0) if_block0.c();
			t0 = space();
			if (if_block1) if_block1.c();
			t1 = space();
			if (if_block2) if_block2.c();
			t2 = space();
			if (if_block3) if_block3.c();
			add_location(blockquote, file, 326, 12, 9500);
		},

		m: function mount(target, anchor) {
			insert(target, blockquote, anchor);
			if (if_block0) if_block0.m(blockquote, null);
			append(blockquote, t0);
			if (if_block1) if_block1.m(blockquote, null);
			append(blockquote, t1);
			if (if_block2) if_block2.m(blockquote, null);
			append(blockquote, t2);
			if (if_block3) if_block3.m(blockquote, null);
		},

		p: function update(changed, ctx) {
			if (ctx.channel) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_10(ctx);
					if_block0.c();
					if_block0.m(blockquote, t0);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.root) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_9(ctx);
					if_block1.c();
					if_block1.m(blockquote, t1);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (ctx.branch) {
				if (if_block2) {
					if_block2.p(changed, ctx);
				} else {
					if_block2 = create_if_block_8(ctx);
					if_block2.c();
					if_block2.m(blockquote, t2);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (ctx.contentWarning.length > 0) {
				if (if_block3) {
					if_block3.p(changed, ctx);
				} else {
					if_block3 = create_if_block_7(ctx);
					if_block3.c();
					if_block3.m(blockquote, null);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(blockquote);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
		}
	};
}

// (328:14) {#if channel}
function create_if_block_10(ctx) {
	var p, b, t1, t2_value = ctx.channel.startsWith('#') ? ctx.channel.slice(1) : ctx.channel, t2;

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "Channel:";
			t1 = space();
			t2 = text(t2_value);
			add_location(b, file, 329, 18, 9582);
			add_location(p, file, 328, 16, 9559);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t1);
			append(p, t2);
		},

		p: function update(changed, ctx) {
			if ((changed.channel) && t2_value !== (t2_value = ctx.channel.startsWith('#') ? ctx.channel.slice(1) : ctx.channel)) {
				set_data(t2, t2_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (334:14) {#if root}
function create_if_block_9(ctx) {
	var p, b, t1, t2;

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "Root:";
			t1 = space();
			t2 = text(ctx.root);
			add_location(b, file, 335, 18, 9781);
			add_location(p, file, 334, 16, 9758);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t1);
			append(p, t2);
		},

		p: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (340:14) {#if branch}
function create_if_block_8(ctx) {
	var p, b, t1, t2;

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "In Reply To:";
			t1 = space();
			t2 = text(ctx.branch);
			add_location(b, file, 341, 18, 9931);
			add_location(p, file, 340, 16, 9908);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t1);
			append(p, t2);
		},

		p: function update(changed, ctx) {
			if (changed.branch) {
				set_data(t2, ctx.branch);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (346:14) {#if contentWarning.length > 0}
function create_if_block_7(ctx) {
	var p, b, t1, t2;

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "Content Warning:";
			t1 = space();
			t2 = text(ctx.contentWarning);
			add_location(b, file, 347, 18, 10109);
			add_location(p, file, 346, 16, 10086);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t1);
			append(p, t2);
		},

		p: function update(changed, ctx) {
			if (changed.contentWarning) {
				set_data(t2, ctx.contentWarning);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (265:10) {#if branch}
function create_if_block_5(ctx) {
	var label, t_1, input, dispose;

	return {
		c: function create() {
			label = element("label");
			label.textContent = "In reply to";
			t_1 = space();
			input = element("input");
			attr(label, "class", "form-label");
			attr(label, "for", "reply-to");
			add_location(label, file, 265, 12, 6993);
			attr(input, "class", "form-input");
			attr(input, "type", "text");
			attr(input, "id", "reply-to");
			attr(input, "placeholder", "in reply to");
			add_location(input, file, 266, 12, 7067);
			dispose = listen(input, "input", ctx.input_input_handler);
		},

		m: function mount(target, anchor) {
			insert(target, label, anchor);
			insert(target, t_1, anchor);
			insert(target, input, anchor);

			input.value = ctx.branch;
		},

		p: function update(changed, ctx) {
			if (changed.branch && (input.value !== ctx.branch)) input.value = ctx.branch;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(label);
				detach(t_1);
				detach(input);
			}

			dispose();
		}
	};
}

// (275:10) {#if replyfeed}
function create_if_block_4(ctx) {
	var div, span, t, current;

	var avatarchip = new ctx.AvatarChip({
		props: { feed: ctx.replyfeed },
		$$inline: true
	});
	avatarchip.$on("avatarClick", ctx.avatarClick);

	return {
		c: function create() {
			div = element("div");
			span = element("span");
			t = text("Click the avatar to add a link to the message:\r\n                ");
			avatarchip.$$.fragment.c();
			add_location(span, file, 276, 14, 7336);
			attr(div, "class", "mt-2");
			add_location(div, file, 275, 12, 7302);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, span);
			append(span, t);
			mount_component(avatarchip, span, null);
			current = true;
		},

		p: function update(changed, ctx) {
			var avatarchip_changes = {};
			if (changed.replyfeed) avatarchip_changes.feed = ctx.replyfeed;
			avatarchip.$set(avatarchip_changes);
		},

		i: function intro(local) {
			if (current) return;
			transition_in(avatarchip.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(avatarchip.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}

			destroy_component(avatarchip);
		}
	};
}

// (297:12) {#if showContentWarningField}
function create_if_block_3(ctx) {
	var input, dispose;

	return {
		c: function create() {
			input = element("input");
			attr(input, "type", "text");
			attr(input, "size", "50");
			attr(input, "placeholder", "Describe your content warning (leave empty to no use it)");
			add_location(input, file, 297, 14, 8186);
			dispose = listen(input, "input", ctx.input_input_handler_1);
		},

		m: function mount(target, anchor) {
			insert(target, input, anchor);

			input.value = ctx.contentWarning;
		},

		p: function update(changed, ctx) {
			if (changed.contentWarning && (input.value !== ctx.contentWarning)) input.value = ctx.contentWarning;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(input);
			}

			dispose();
		}
	};
}

// (307:10) {#if getPref("platform-ipfs-enabled", "yes") === "yes" && ipfsDaemonRunning}
function create_if_block_2(ctx) {
	var input, t, button, dispose;

	return {
		c: function create() {
			input = element("input");
			t = space();
			button = element("button");
			button.textContent = "Attach File using IPFS";
			attr(input, "type", "file");
			attr(input, "id", "fileInputIPFS");
			attr(input, "class", "svelte-olsuyr");
			add_location(input, file, 307, 12, 8674);
			attr(button, "class", "btn");
			add_location(button, file, 308, 12, 8754);

			dispose = [
				listen(input, "input", ctx.attachFileIPFS),
				listen(button, "click", ctx.attachFileIPFSTrigger)
			];
		},

		m: function mount(target, anchor) {
			insert(target, input, anchor);
			insert(target, t, anchor);
			insert(target, button, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(input);
				detach(t);
				detach(button);
			}

			run_all(dispose);
		}
	};
}

// (313:11) {#if getPref("platform-dat-enabled", "yes") === "yes" && datDaemonRunning}
function create_if_block_1(ctx) {
	var input, t, button, dispose;

	return {
		c: function create() {
			input = element("input");
			t = space();
			button = element("button");
			button.textContent = "Attach File using Dat";
			attr(input, "type", "file");
			attr(input, "id", "fileInputDAT");
			attr(input, "class", "svelte-olsuyr");
			add_location(input, file, 313, 12, 8986);
			attr(button, "class", "btn");
			add_location(button, file, 314, 12, 9064);

			dispose = [
				listen(input, "input", ctx.attachFileDAT),
				listen(button, "click", ctx.attachFileDATTrigger)
			];
		},

		m: function mount(target, anchor) {
			insert(target, input, anchor);
			insert(target, t, anchor);
			insert(target, button, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(input);
				detach(t);
				detach(button);
			}

			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	var div2, div1, div0, t0, t1, current_block_type_index, if_block2, current;

	var if_block0 = (ctx.fork) && create_if_block_13(ctx);

	var if_block1 = (ctx.msg) && create_if_block_11(ctx);

	var if_block_creators = [
		create_if_block,
		create_else_block
	];

	var if_blocks = [];

	function select_block_type_1(ctx) {
		if (!ctx.showPreview) return 0;
		return 1;
	}

	current_block_type_index = select_block_type_1(ctx);
	if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c: function create() {
			div2 = element("div");
			div1 = element("div");
			div0 = element("div");
			if (if_block0) if_block0.c();
			t0 = space();
			if (if_block1) if_block1.c();
			t1 = space();
			if_block2.c();
			attr(div0, "class", "column");
			add_location(div0, file, 236, 4, 6090);
			attr(div1, "class", "columns");
			add_location(div1, file, 235, 2, 6063);
			attr(div2, "class", "container");
			add_location(div2, file, 234, 0, 6036);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div1);
			append(div1, div0);
			if (if_block0) if_block0.m(div0, null);
			append(div0, t0);
			if (if_block1) if_block1.m(div0, null);
			append(div0, t1);
			if_blocks[current_block_type_index].m(div0, null);
			current = true;
		},

		p: function update(changed, ctx) {
			if (ctx.fork) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_13(ctx);
					if_block0.c();
					if_block0.m(div0, t0);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.msg) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_11(ctx);
					if_block1.c();
					if_block1.m(div0, t1);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type_1(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block2 = if_blocks[current_block_type_index];
				if (!if_block2) {
					if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block2.c();
				}
				transition_in(if_block2, 1);
				if_block2.m(div0, null);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(if_block2);
			current = true;
		},

		o: function outro(local) {
			transition_out(if_block2);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div2);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if_blocks[current_block_type_index].d();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $routeParams;

	const { onMount } = require("svelte");
  const drop = require("drag-and-drop-files");
  const { slide } = require("svelte/transition");
  const { navigate, routeParams, reconnect } = require("../../utils.js"); validate_store(routeParams, 'routeParams'); component_subscribe($$self, routeParams, $$value => { $routeParams = $$value; $$invalidate('$routeParams', $routeParams) });
  const { getPref } = require("../../prefs.js");
  const AvatarChip = require("../../parts/AvatarChip.svelte");

  let showPreview = false;
  let msg = false;
  let error = false;
  let posting = false;

  let root = $routeParams.root;
  let branch = $routeParams.branch;
  let channel = $routeParams.channel || "";
  let content = $routeParams.content || "";
  let replyfeed = $routeParams.replyfeed || false;
  let fork = $routeParams.fork;
  let fileOnTop = false;
  let pull = hermiebox.modules.pullStream;
  let fileReader = hermiebox.modules.pullFileReader;
  let sbot = hermiebox.sbot;
  let ipfsDaemonRunning = false;
  let datDaemonRunning = false;

  document.title = `Patchfox - compose`;

  onMount(() => {
    $$invalidate('error', error = false);
    $$invalidate('msg', msg = "");

    // this code could be in some better/smarter place.
    // e.dataTransfer.getData('url'); from images in the browser window

    drop(document.getElementById("content"), files => readFileAndAttach(files));
    checkIpfsDaemon();
    checkDatDaemon();
  });

  const checkIpfsDaemon = () => {
    let port = getPref("ipfsPort", 5001);
    fetch(`http://127.0.0.1:${port}/api/v0/config/show`).then(data => {
      $$invalidate('ipfsDaemonRunning', ipfsDaemonRunning = true);
    });
  };

   const checkDatDaemon = () => {
      $$invalidate('datDaemonRunning', datDaemonRunning = false);
  };

  const readFileAndAttach = files => {
    $$invalidate('error', error = false);
    $$invalidate('msg', msg = "");

    if (files.length == 0) {
      $$invalidate('fileOnTop', fileOnTop = false);
      console.log("this is not a file");
      return false;
    }

    var first = files[0];
    console.log(first);

    if (!first.type.startsWith("image")) {
      $$invalidate('error', error = true);
      $$invalidate('msg', msg = `You can only drag & drop image, this file is a ${first.type}`);
      return false;
    }

    if (first.size >= 5000000) {
      $$invalidate('error', error = true);
      $$invalidate('msg', msg = `File too large: ${Math.floor(
        first.size / 1048576,
        2
      )}mb when max size is 5mb`);
      return false;
    }

    pull(
      fileReader(first),
      sbot.blobs.add(function(err, hash) {
        // 'hash' is the hash-id of the blob
        if (err) {
          $$invalidate('error', error = true);
          $$invalidate('msg', msg = "Couldn't attach file: " + err);
        } else {
          $$invalidate('content', content += ` ![${first.name}](${hash})`);
        }
        $$invalidate('fileOnTop', fileOnTop = false);
      })
    );
  };

  const post = async ev => {
    ev.stopPropagation();
    ev.preventDefault();

    if (!posting) {
      $$invalidate('posting', posting = true);

      if (channel.startsWith("#")) {
        $$invalidate('channel', channel = channel.slice(1));
      }

      try {
        $$invalidate('msg', msg = await ssb.newPost({
          text: content,
          channel,
          root,
          branch,
          fork,
          contentWarning: contentWarning.length > 0 ? contentWarning : undefined
        }));
        $$invalidate('posting', posting = false);
        console.log("posted", msg);
        window.scrollTo(0, 0);
      } catch (n) {
        $$invalidate('error', error = true);
        $$invalidate('msg', msg = `Couldn't post your message: ${n}`);
        window.scrollTo(0, 0);

        if (msg.message == "stream is closed") {
          $$invalidate('msg', msg += ". We lost connection to sbot. We'll try to restablish it...");

          reconnect()
            .then(() => {
              $$invalidate('showPreview', showPreview = false);
              $$invalidate('posting', posting = false);
              $$invalidate('error', error = false);
              $$invalidate('msg', msg = "Connection to sbot reestablished. Try posting again");
            })
            .catch(err => {
              window.location.search = `?root=${encodeURIComponent(
                root
              )}&branch=${encodeURIComponent(
                branch
              )}&content=${encodeURIComponent(
                content
              )}&channel=${encodeURIComponent(channel)}`;
              $$invalidate('msg', msg = `Sorry, couldn't reconnect to sbot:${err}. Try reloading the page. Your content has been saved to the URL`);
            });
        }
      }
    }
  };

  const preview = ev => {
    $$invalidate('showPreview', showPreview = true);
  };

  const saveToURL = ev => {
    window.location.search = `?root=${encodeURIComponent(
      root
    )}&branch=${encodeURIComponent(branch)}&content=${encodeURIComponent(
      content
    )}&channel=${encodeURIComponent(channel)}`;
  };

  const avatarClick = ev => {
    let feed = ev.detail.feed;
    let name = ev.detail.name;

    if (content.length > 0) {
      $$invalidate('content', content += ` [${name}](${feed})`);
    } else {
      $$invalidate('content', content = `[${name}](${feed})`);
    }
  };

  const dragOver = ev => {
    $$invalidate('fileOnTop', fileOnTop = true);
  };

  const dragLeave = ev => {
    $$invalidate('fileOnTop', fileOnTop = false);
  };

  const attachFileTrigger = () => {
    document.getElementById("fileInput").click();
  };

  const attachFileIPFSTrigger = () => {
    document.getElementById("fileInputIPFS").click();
  };

  const attachFileDATTrigger = () => {
    document.getElementById("fileInputDAT").click();
  };

  const attachFile = ev => {
    const files = ev.target.files;
    readFileAndAttach(files);
  };

  const attachFileIPFS = ev => {
    const files = ev.target.files;
    readFileAndAttachIPFS(files);
  };

  const attachFileDAT = ev => {
    const files = ev.target.files;
    readFileAndAttachDAT(files);
  };

  const readFileAndAttachIPFS = async files => {
    $$invalidate('error', error = false);
    $$invalidate('msg', msg = "");

    var ipfs = window.IpfsHttpClient("127.0.0.1", "5001");
    const results = await ipfs.add(files[0]);

    console.log("added via IPFS", results);
    $$invalidate('content', content += ` [${results[0].path}](ipfs://${results[0].hash})`);
  };

  let showContentWarningField = false;

  const toggleContentWarning = () =>
    { const $$result = (showContentWarningField = !showContentWarningField); $$invalidate('showContentWarningField', showContentWarningField); return $$result; };

  let contentWarning = "";

	function input0_input_handler() {
		channel = this.value;
		$$invalidate('channel', channel);
	}

	function input_input_handler() {
		branch = this.value;
		$$invalidate('branch', branch);
	}

	function textarea_input_handler() {
		content = this.value;
		$$invalidate('content', content);
	}

	function input_input_handler_1() {
		contentWarning = this.value;
		$$invalidate('contentWarning', contentWarning);
	}

	function click_handler() {
		const $$result = (showPreview = false);
		$$invalidate('showPreview', showPreview);
		return $$result;
	}

	return {
		slide,
		routeParams,
		getPref,
		AvatarChip,
		showPreview,
		msg,
		error,
		posting,
		root,
		branch,
		channel,
		content,
		replyfeed,
		fork,
		fileOnTop,
		ipfsDaemonRunning,
		datDaemonRunning,
		post,
		preview,
		avatarClick,
		dragOver,
		dragLeave,
		attachFileTrigger,
		attachFileIPFSTrigger,
		attachFileDATTrigger,
		attachFile,
		attachFileIPFS,
		attachFileDAT,
		showContentWarningField,
		toggleContentWarning,
		contentWarning,
		ssb,
		encodeURIComponent,
		input0_input_handler,
		input_input_handler,
		textarea_input_handler,
		input_input_handler_1,
		click_handler
	};
}

class Compose extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document_1.getElementById("svelte-olsuyr-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = Compose;

},{"../../parts/AvatarChip.svelte":26,"../../prefs.js":28,"../../utils.js":30,"drag-and-drop-files":2,"svelte":7,"svelte/internal":8,"svelte/transition":10}],49:[function(require,module,exports){
/* ComposeBlog.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	SvelteComponentDev,
	add_location,
	add_render_callback,
	append,
	attr,
	check_outros,
	component_subscribe,
	create_in_transition,
	create_out_transition,
	destroy_component,
	detach,
	element,
	empty,
	globals,
	group_outros,
	init,
	insert,
	listen,
	mount_component,
	prevent_default,
	run_all,
	safe_not_equal,
	set_data,
	space,
	stop_propagation,
	text,
	toggle_class,
	transition_in,
	transition_out,
	validate_store
} = require("svelte/internal");

const { document: document_1 } = globals;

const file = "ComposeBlog.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-1irvyx7-style';
	style.textContent = ".file-on-top.svelte-1irvyx7{border:solid 2px rgb(26, 192, 11)}input[type=\"file\"].svelte-1irvyx7{display:none}.thumbnail-preview.svelte-1irvyx7{max-height:200px}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ29tcG9zZUJsb2cuc3ZlbHRlIiwic291cmNlcyI6WyJDb21wb3NlQmxvZy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cclxuICBjb25zdCB7IG9uTW91bnQgfSA9IHJlcXVpcmUoXCJzdmVsdGVcIik7XHJcbiAgY29uc3QgZHJvcCA9IHJlcXVpcmUoXCJkcmFnLWFuZC1kcm9wLWZpbGVzXCIpO1xyXG4gIGNvbnN0IHsgc2xpZGUgfSA9IHJlcXVpcmUoXCJzdmVsdGUvdHJhbnNpdGlvblwiKTtcclxuICBjb25zdCB7IG5hdmlnYXRlLCByb3V0ZVBhcmFtcywgcmVjb25uZWN0IH0gPSByZXF1aXJlKFwiLi4vLi4vLi4vdXRpbHMuanNcIik7XHJcbiAgY29uc3QgeyBnZXRQcmVmIH0gPSByZXF1aXJlKFwiLi4vLi4vLi4vcHJlZnMuanNcIik7XHJcbiAgY29uc3QgQXZhdGFyQ2hpcCA9IHJlcXVpcmUoXCIuLi8uLi8uLi9wYXJ0cy9BdmF0YXJDaGlwLnN2ZWx0ZVwiKTtcclxuICBjb25zdCBQcmV2aWV3ID0gcmVxdWlyZShcIi4vUHJldmlldy5zdmVsdGVcIik7XHJcblxyXG4gIGxldCBzaG93UHJldmlldyA9IGZhbHNlO1xyXG4gIGxldCBtc2cgPSBmYWxzZTtcclxuICBsZXQgZXJyb3IgPSBmYWxzZTtcclxuICBsZXQgcG9zdGluZyA9IGZhbHNlO1xyXG5cclxuICBsZXQgY2hhbm5lbCA9ICRyb3V0ZVBhcmFtcy5jaGFubmVsIHx8IFwiXCI7XHJcbiAgbGV0IGNvbnRlbnQgPSAkcm91dGVQYXJhbXMuY29udGVudCB8fCBcIlwiO1xyXG4gIGxldCBzdW1tYXJ5ID0gJHJvdXRlUGFyYW1zLnN1bW1hcnkgfHwgXCJcIjtcclxuICBsZXQgdGl0bGUgPSAkcm91dGVQYXJhbXMudGl0bGUgfHwgXCJcIjtcclxuICBsZXQgdGh1bWJuYWlsID0gJHJvdXRlUGFyYW1zLnRodW1ibmFpbDtcclxuICBsZXQgZmlsZU9uVG9wID0gZmFsc2U7XHJcbiAgbGV0IHB1bGwgPSBoZXJtaWVib3gubW9kdWxlcy5wdWxsU3RyZWFtO1xyXG4gIGxldCBmaWxlUmVhZGVyID0gaGVybWllYm94Lm1vZHVsZXMucHVsbEZpbGVSZWFkZXI7XHJcbiAgbGV0IHNib3QgPSBoZXJtaWVib3guc2JvdDtcclxuICBsZXQgaXBmc0RhZW1vblJ1bm5pbmcgPSBmYWxzZTtcclxuICBsZXQgZGF0RGFlbW9uUnVubmluZyA9IGZhbHNlO1xyXG5cclxuICBkb2N1bWVudC50aXRsZSA9IGBQYXRjaGZveCAtIGNvbXBvc2UgbmV3IGJsb2cgcG9zdGA7XHJcblxyXG4gIG9uTW91bnQoKCkgPT4ge1xyXG4gICAgZXJyb3IgPSBmYWxzZTtcclxuICAgIG1zZyA9IFwiXCI7XHJcblxyXG4gICAgLy8gdGhpcyBjb2RlIGNvdWxkIGJlIGluIHNvbWUgYmV0dGVyL3NtYXJ0ZXIgcGxhY2UuXHJcbiAgICAvLyBlLmRhdGFUcmFuc2Zlci5nZXREYXRhKCd1cmwnKTsgZnJvbSBpbWFnZXMgaW4gdGhlIGJyb3dzZXIgd2luZG93XHJcblxyXG4gICAgZHJvcChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvbnRlbnRcIiksIGZpbGVzID0+IHJlYWRGaWxlQW5kQXR0YWNoKGZpbGVzKSk7XHJcbiAgICBjaGVja0lwZnNEYWVtb24oKTtcclxuICAgIGNoZWNrRGF0RGFlbW9uKCk7XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IGNoZWNrSXBmc0RhZW1vbiA9ICgpID0+IHtcclxuICAgIGxldCBwb3J0ID0gZ2V0UHJlZihcImlwZnNQb3J0XCIsIDUwMDEpO1xyXG4gICAgZmV0Y2goYGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fS9hcGkvdjAvY29uZmlnL3Nob3dgKS50aGVuKGRhdGEgPT4ge1xyXG4gICAgICBpcGZzRGFlbW9uUnVubmluZyA9IHRydWU7XHJcbiAgICB9KTtcclxuICB9O1xyXG5cclxuICBjb25zdCBjaGVja0RhdERhZW1vbiA9ICgpID0+IHtcclxuICAgIGRhdERhZW1vblJ1bm5pbmcgPSBmYWxzZTtcclxuICB9O1xyXG5cclxuICBjb25zdCByZWFkRmlsZUFuZEF0dGFjaCA9IGZpbGVzID0+IHtcclxuICAgIGVycm9yID0gZmFsc2U7XHJcbiAgICBtc2cgPSBcIlwiO1xyXG5cclxuICAgIGlmIChmaWxlcy5sZW5ndGggPT0gMCkge1xyXG4gICAgICBmaWxlT25Ub3AgPSBmYWxzZTtcclxuICAgICAgY29uc29sZS5sb2coXCJ0aGlzIGlzIG5vdCBhIGZpbGVcIik7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZmlyc3QgPSBmaWxlc1swXTtcclxuICAgIGNvbnNvbGUubG9nKGZpcnN0KTtcclxuXHJcbiAgICBpZiAoIWZpcnN0LnR5cGUuc3RhcnRzV2l0aChcImltYWdlXCIpKSB7XHJcbiAgICAgIGVycm9yID0gdHJ1ZTtcclxuICAgICAgbXNnID0gYFlvdSBjYW4gb25seSBkcmFnICYgZHJvcCBpbWFnZSwgdGhpcyBmaWxlIGlzIGEgJHtmaXJzdC50eXBlfWA7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZmlyc3Quc2l6ZSA+PSA1MDAwMDAwKSB7XHJcbiAgICAgIGVycm9yID0gdHJ1ZTtcclxuICAgICAgbXNnID0gYEZpbGUgdG9vIGxhcmdlOiAke01hdGguZmxvb3IoXHJcbiAgICAgICAgZmlyc3Quc2l6ZSAvIDEwNDg1NzYsXHJcbiAgICAgICAgMlxyXG4gICAgICApfW1iIHdoZW4gbWF4IHNpemUgaXMgNW1iYDtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1bGwoXHJcbiAgICAgIGZpbGVSZWFkZXIoZmlyc3QpLFxyXG4gICAgICBzYm90LmJsb2JzLmFkZChmdW5jdGlvbihlcnIsIGhhc2gpIHtcclxuICAgICAgICAvLyAnaGFzaCcgaXMgdGhlIGhhc2gtaWQgb2YgdGhlIGJsb2JcclxuICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICBlcnJvciA9IHRydWU7XHJcbiAgICAgICAgICBtc2cgPSBcIkNvdWxkbid0IGF0dGFjaCBmaWxlOiBcIiArIGVycjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29udGVudCArPSBgICFbJHtmaXJzdC5uYW1lfV0oJHtoYXNofSlgO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmaWxlT25Ub3AgPSBmYWxzZTtcclxuICAgICAgfSlcclxuICAgICk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgcG9zdCA9IGFzeW5jIGV2ID0+IHtcclxuICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgZXYucHJldmVudERlZmF1bHQoKTtcclxuXHJcbiAgICBpZiAoIXBvc3RpbmcpIHtcclxuICAgICAgcG9zdGluZyA9IHRydWU7XHJcblxyXG4gICAgICBpZiAoY2hhbm5lbC5zdGFydHNXaXRoKFwiI1wiKSkge1xyXG4gICAgICAgIGNoYW5uZWwgPSBjaGFubmVsLnNsaWNlKDEpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIG1zZyA9IGF3YWl0IHNzYi5uZXdCbG9nUG9zdCh7XHJcbiAgICAgICAgICBjb250ZW50LFxyXG4gICAgICAgICAgc3VtbWFyeSxcclxuICAgICAgICAgIGNoYW5uZWwsXHJcbiAgICAgICAgICB0aXRsZSxcclxuICAgICAgICAgIHRodW1ibmFpbCxcclxuICAgICAgICAgIGNvbnRlbnRXYXJuaW5nOiBjb250ZW50V2FybmluZy5sZW5ndGggPiAwID8gY29udGVudFdhcm5pbmcgOiB1bmRlZmluZWRcclxuICAgICAgICB9KTtcclxuICAgICAgICBwb3N0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJwb3N0ZWRcIiwgbXNnKTtcclxuICAgICAgICB3aW5kb3cuc2Nyb2xsVG8oMCwgMCk7XHJcbiAgICAgIH0gY2F0Y2ggKG4pIHtcclxuICAgICAgICBlcnJvciA9IHRydWU7XHJcbiAgICAgICAgbXNnID0gYENvdWxkbid0IHBvc3QgeW91ciBtZXNzYWdlOiAke259YDtcclxuICAgICAgICB3aW5kb3cuc2Nyb2xsVG8oMCwgMCk7XHJcblxyXG4gICAgICAgIGlmIChtc2cubWVzc2FnZSA9PSBcInN0cmVhbSBpcyBjbG9zZWRcIikge1xyXG4gICAgICAgICAgbXNnICs9IFwiLiBXZSBsb3N0IGNvbm5lY3Rpb24gdG8gc2JvdC4gV2UnbGwgdHJ5IHRvIHJlc3RhYmxpc2ggaXQuLi5cIjtcclxuXHJcbiAgICAgICAgICByZWNvbm5lY3QoKVxyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgICAgc2hvd1ByZXZpZXcgPSBmYWxzZTtcclxuICAgICAgICAgICAgICBwb3N0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgZXJyb3IgPSBmYWxzZTtcclxuICAgICAgICAgICAgICBtc2cgPSBcIkNvbm5lY3Rpb24gdG8gc2JvdCByZWVzdGFibGlzaGVkLiBUcnkgcG9zdGluZyBhZ2FpblwiO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICAgICAgICBzYXZlVG9VUkwoKTtcclxuICAgICAgICAgICAgICBtc2cgPSBgU29ycnksIGNvdWxkbid0IHJlY29ubmVjdCB0byBzYm90OiR7ZXJyfS4gVHJ5IHJlbG9hZGluZyB0aGUgcGFnZS4gWW91ciBjb250ZW50IGhhcyBiZWVuIHNhdmVkIHRvIHRoZSBVUkxgO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBwcmV2aWV3ID0gZXYgPT4ge1xyXG4gICAgc2hvd1ByZXZpZXcgPSB0cnVlO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IHNhdmVUb1VSTCA9IGV2ID0+IHtcclxuICAgIHdpbmRvdy5sb2NhdGlvbi5zZWFyY2ggPSBgP3N1bW1hcnk9JHtlbmNvZGVVUklDb21wb25lbnQoXHJcbiAgICAgIHN1bW1hcnlcclxuICAgICl9JnRpdGxlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKX0mY29udGVudD0ke2VuY29kZVVSSUNvbXBvbmVudChcclxuICAgICAgY29udGVudFxyXG4gICAgKX0mY2hhbm5lbD0ke2VuY29kZVVSSUNvbXBvbmVudChjaGFubmVsKX0mdGh1bWJuYWlsPSR7ZW5jb2RlVVJJQ29tcG9uZW50KFxyXG4gICAgICB0aHVtYm5haWxcclxuICAgICl9YDtcclxuICB9O1xyXG5cclxuICBjb25zdCBkcmFnT3ZlciA9IGV2ID0+IHtcclxuICAgIGZpbGVPblRvcCA9IHRydWU7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgZHJhZ0xlYXZlID0gZXYgPT4ge1xyXG4gICAgZmlsZU9uVG9wID0gZmFsc2U7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYXR0YWNoRmlsZVRyaWdnZXIgPSAoKSA9PiB7XHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZpbGVJbnB1dFwiKS5jbGljaygpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGF0dGFjaFRodW1ibmFpbFRyaWdnZXIgPSAoKSA9PiB7XHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRodW1ibmFpbElucHV0XCIpLmNsaWNrKCk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYXR0YWNoRmlsZUlQRlNUcmlnZ2VyID0gKCkgPT4ge1xyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmaWxlSW5wdXRJUEZTXCIpLmNsaWNrKCk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYXR0YWNoRmlsZURBVFRyaWdnZXIgPSAoKSA9PiB7XHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZpbGVJbnB1dERBVFwiKS5jbGljaygpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGF0dGFjaEZpbGUgPSBldiA9PiB7XHJcbiAgICBjb25zdCBmaWxlcyA9IGV2LnRhcmdldC5maWxlcztcclxuICAgIHJlYWRGaWxlQW5kQXR0YWNoKGZpbGVzKTtcclxuICB9O1xyXG5cclxuICBjb25zdCBhdHRhY2hUaHVtYm5haWwgPSBldiA9PiB7XHJcbiAgICBjb25zdCBmaWxlcyA9IGV2LnRhcmdldC5maWxlcztcclxuICAgIHJlYWRGaWxlQW5kQXR0YWNoVGh1bWJuYWlsKGZpbGVzKTtcclxuICB9O1xyXG5cclxuICBjb25zdCByZWFkRmlsZUFuZEF0dGFjaFRodW1ibmFpbCA9IGZpbGVzID0+IHtcclxuICAgIGVycm9yID0gZmFsc2U7XHJcbiAgICBtc2cgPSBcIlwiO1xyXG5cclxuICAgIGlmIChmaWxlcy5sZW5ndGggPT0gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhcInRoaXMgaXMgbm90IGEgZmlsZVwiKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBmaXJzdCA9IGZpbGVzWzBdO1xyXG4gICAgY29uc29sZS5sb2coZmlyc3QpO1xyXG5cclxuICAgIGlmICghZmlyc3QudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2VcIikpIHtcclxuICAgICAgZXJyb3IgPSB0cnVlO1xyXG4gICAgICBtc2cgPSBgWW91IGNhbiB1c2UgaW1hZ2VzIGFzIHRodW1ibmFpbCwgdGhpcyBmaWxlIGlzIGEgJHtmaXJzdC50eXBlfWA7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZmlyc3Quc2l6ZSA+PSA1MDAwMDAwKSB7XHJcbiAgICAgIGVycm9yID0gdHJ1ZTtcclxuICAgICAgbXNnID0gYEZpbGUgdG9vIGxhcmdlOiAke01hdGguZmxvb3IoXHJcbiAgICAgICAgZmlyc3Quc2l6ZSAvIDEwNDg1NzYsXHJcbiAgICAgICAgMlxyXG4gICAgICApfW1iIHdoZW4gbWF4IHNpemUgaXMgNW1iYDtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHB1bGwoXHJcbiAgICAgIGZpbGVSZWFkZXIoZmlyc3QpLFxyXG4gICAgICBzYm90LmJsb2JzLmFkZChmdW5jdGlvbihlcnIsIGhhc2gpIHtcclxuICAgICAgICAvLyAnaGFzaCcgaXMgdGhlIGhhc2gtaWQgb2YgdGhlIGJsb2JcclxuICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICBlcnJvciA9IHRydWU7XHJcbiAgICAgICAgICBtc2cgPSBcIkNvdWxkbid0IGFkZCBmaWxlOiBcIiArIGVyciArIFwiIGFzIHRodW1ibmFpbFwiO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aHVtYm5haWwgPSBoYXNoO1xyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgICk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYXR0YWNoRmlsZUlQRlMgPSBldiA9PiB7XHJcbiAgICBjb25zdCBmaWxlcyA9IGV2LnRhcmdldC5maWxlcztcclxuICAgIHJlYWRGaWxlQW5kQXR0YWNoSVBGUyhmaWxlcyk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYXR0YWNoRmlsZURBVCA9IGV2ID0+IHtcclxuICAgIGNvbnN0IGZpbGVzID0gZXYudGFyZ2V0LmZpbGVzO1xyXG4gICAgcmVhZEZpbGVBbmRBdHRhY2hEQVQoZmlsZXMpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IHJlYWRGaWxlQW5kQXR0YWNoSVBGUyA9IGFzeW5jIGZpbGVzID0+IHtcclxuICAgIGVycm9yID0gZmFsc2U7XHJcbiAgICBtc2cgPSBcIlwiO1xyXG5cclxuICAgIHZhciBpcGZzID0gd2luZG93LklwZnNIdHRwQ2xpZW50KFwiMTI3LjAuMC4xXCIsIFwiNTAwMVwiKTtcclxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBpcGZzLmFkZChmaWxlc1swXSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coXCJhZGRlZCB2aWEgSVBGU1wiLCByZXN1bHRzKTtcclxuICAgIGNvbnRlbnQgKz0gYCBbJHtyZXN1bHRzWzBdLnBhdGh9XShpcGZzOi8vJHtyZXN1bHRzWzBdLmhhc2h9KWA7XHJcbiAgfTtcclxuXHJcbiAgbGV0IHNob3dDb250ZW50V2FybmluZ0ZpZWxkID0gZmFsc2U7XHJcblxyXG4gIGNvbnN0IHRvZ2dsZUNvbnRlbnRXYXJuaW5nID0gKCkgPT5cclxuICAgIChzaG93Q29udGVudFdhcm5pbmdGaWVsZCA9ICFzaG93Q29udGVudFdhcm5pbmdGaWVsZCk7XHJcblxyXG4gIGxldCBjb250ZW50V2FybmluZyA9IFwiXCI7XHJcbjwvc2NyaXB0PlxyXG5cclxuPHN0eWxlPlxyXG4gIC5maWxlLW9uLXRvcCB7XHJcbiAgICBib3JkZXI6IHNvbGlkIDJweCByZ2IoMjYsIDE5MiwgMTEpO1xyXG4gIH1cclxuXHJcbiAgaW5wdXRbdHlwZT1cImZpbGVcIl0ge1xyXG4gICAgZGlzcGxheTogbm9uZTtcclxuICB9XHJcblxyXG4gIC50aHVtYm5haWwtcHJldmlldyB7XHJcbiAgICBtYXgtaGVpZ2h0OiAyMDBweDtcclxuICB9XHJcbjwvc3R5bGU+XHJcblxyXG48ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgPGRpdiBjbGFzcz1cImNvbHVtbnNcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2x1bW5cIj5cclxuICAgICAgeyNpZiBtc2d9XHJcbiAgICAgICAgeyNpZiBlcnJvcn1cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJ0b2FzdCB0b2FzdC1lcnJvclwiPnttc2d9PC9kaXY+XHJcbiAgICAgICAgezplbHNlfVxyXG4gICAgICAgICAgPGRpdiBjbGFzcz1cInRvYXN0IHRvYXN0LXN1Y2Nlc3NcIj5cclxuICAgICAgICAgICAgWW91ciBibG9nIHBvc3QgaGFzIGJlZW4gcG9zdGVkLiBEbyB5b3Ugd2FudCB0b1xyXG4gICAgICAgICAgICA8YVxyXG4gICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiXHJcbiAgICAgICAgICAgICAgaHJlZj1cIj90aHJlYWQ9e2VuY29kZVVSSUNvbXBvbmVudChtc2cua2V5KX0jL3RocmVhZFwiPlxyXG4gICAgICAgICAgICAgIENoZWNrIGl0IG91dD9cclxuICAgICAgICAgICAgPC9hPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgey9pZn1cclxuICAgICAgey9pZn1cclxuICAgICAgeyNpZiAhc2hvd1ByZXZpZXd9XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXBcIiBpbjpzbGlkZSBvdXQ6c2xpZGU+XHJcbiAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJmb3JtLWxhYmVsXCIgZm9yPVwiY2hhbm5lbFwiPkNoYW5uZWw8L2xhYmVsPlxyXG4gICAgICAgICAgPGlucHV0XHJcbiAgICAgICAgICAgIGNsYXNzPVwiZm9ybS1pbnB1dFwiXHJcbiAgICAgICAgICAgIHR5cGU9XCJ0ZXh0XCJcclxuICAgICAgICAgICAgaWQ9XCJjaGFubmVsXCJcclxuICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCJjaGFubmVsXCJcclxuICAgICAgICAgICAgYmluZDp2YWx1ZT17Y2hhbm5lbH0gLz5cclxuXHJcbiAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJmb3JtLWxhYmVsXCIgZm9yPVwidGl0bGVcIj5UaXRsZTwvbGFiZWw+XHJcbiAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgY2xhc3M9XCJmb3JtLWlucHV0XCJcclxuICAgICAgICAgICAgdHlwZT1cInRleHRcIlxyXG4gICAgICAgICAgICBpZD1cInRpdGxlXCJcclxuICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCJ0aXRsZVwiXHJcbiAgICAgICAgICAgIGJpbmQ6dmFsdWU9e3RpdGxlfSAvPlxyXG5cclxuICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImZvcm0tbGFiZWxcIiBmb3I9XCJzdW1tYXJ5XCI+U3VtbWFyeTwvbGFiZWw+XHJcbiAgICAgICAgICA8dGV4dGFyZWFcclxuICAgICAgICAgICAgY2xhc3M9XCJmb3JtLWlucHV0XCJcclxuICAgICAgICAgICAgaWQ9XCJzdW1tYXJ5XCJcclxuICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCJUeXBlIGluIHlvdXIgc3VtbWFyeVwiXHJcbiAgICAgICAgICAgIHJvd3M9XCI1XCJcclxuICAgICAgICAgICAgb246ZHJhZ292ZXJ8cHJldmVudERlZmF1bHR8c3RvcFByb3BhZ2F0aW9uPXtkcmFnT3Zlcn1cclxuICAgICAgICAgICAgb246ZHJhZ2xlYXZlfHByZXZlbnREZWZhdWx0fHN0b3BQcm9wYWdhdGlvbj17ZHJhZ0xlYXZlfVxyXG4gICAgICAgICAgICBjbGFzczpmaWxlLW9uLXRvcD17ZmlsZU9uVG9wfVxyXG4gICAgICAgICAgICBiaW5kOnZhbHVlPXtzdW1tYXJ5fSAvPlxyXG5cclxuICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImZvcm0tbGFiZWxcIiBmb3I9XCJjb250ZW50XCI+Q29udGVudDwvbGFiZWw+XHJcbiAgICAgICAgICA8dGV4dGFyZWFcclxuICAgICAgICAgICAgY2xhc3M9XCJmb3JtLWlucHV0XCJcclxuICAgICAgICAgICAgaWQ9XCJjb250ZW50XCJcclxuICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCJUeXBlIGluIHlvdXIgYmxvZyBwb3N0IGNvbnRlbnRcIlxyXG4gICAgICAgICAgICByb3dzPVwiMjBcIlxyXG4gICAgICAgICAgICBvbjpkcmFnb3ZlcnxwcmV2ZW50RGVmYXVsdHxzdG9wUHJvcGFnYXRpb249e2RyYWdPdmVyfVxyXG4gICAgICAgICAgICBvbjpkcmFnbGVhdmV8cHJldmVudERlZmF1bHR8c3RvcFByb3BhZ2F0aW9uPXtkcmFnTGVhdmV9XHJcbiAgICAgICAgICAgIGNsYXNzOmZpbGUtb24tdG9wPXtmaWxlT25Ub3B9XHJcbiAgICAgICAgICAgIGJpbmQ6dmFsdWU9e2NvbnRlbnR9IC8+XHJcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiZC1ibG9jayBtLTJcIj5cclxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tbGlua1wiIG9uOmNsaWNrPXt0b2dnbGVDb250ZW50V2FybmluZ30+XHJcbiAgICAgICAgICAgICAgQ1dcclxuICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIHsjaWYgc2hvd0NvbnRlbnRXYXJuaW5nRmllbGR9XHJcbiAgICAgICAgICAgICAgPGlucHV0XHJcbiAgICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXHJcbiAgICAgICAgICAgICAgICBzaXplPVwiNTBcIlxyXG4gICAgICAgICAgICAgICAgYmluZDp2YWx1ZT17Y29udGVudFdhcm5pbmd9XHJcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIkRlc2NyaWJlIHlvdXIgY29udGVudCB3YXJuaW5nIChsZWF2ZSBlbXB0eSB0byBub1xyXG4gICAgICAgICAgICAgICAgdXNlIGl0KVwiIC8+XHJcbiAgICAgICAgICAgIHsvaWZ9XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgIHsjaWYgdGh1bWJuYWlsfVxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZC1ibG9jayBtLTJcIj5cclxuICAgICAgICAgICAgICA8cD5UaHVtYm5haWw8L3A+XHJcbiAgICAgICAgICAgICAgPGltZ1xyXG4gICAgICAgICAgICAgICAgY2xhc3M9XCJ0aHVtYm5haWwtcHJldmlld1wiXHJcbiAgICAgICAgICAgICAgICBzcmM9XCJodHRwOi8vbG9jYWxob3N0Ojg5ODkvYmxvYnMvZ2V0L3t0aHVtYm5haWx9XCJcclxuICAgICAgICAgICAgICAgIGFsdD1cInBvc3QgdGh1bWJuYWlsXCIgLz5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICB7L2lmfVxyXG4gICAgICAgICAgPGlucHV0IHR5cGU9XCJmaWxlXCIgb246aW5wdXQ9e2F0dGFjaFRodW1ibmFpbH0gaWQ9XCJ0aHVtYm5haWxJbnB1dFwiIC8+XHJcbiAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuXCIgb246Y2xpY2s9e2F0dGFjaFRodW1ibmFpbFRyaWdnZXJ9PlxyXG4gICAgICAgICAgICBBdHRhY2ggVGh1bWJuYWlsIEltYWdlXHJcbiAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgIDxpbnB1dCB0eXBlPVwiZmlsZVwiIG9uOmlucHV0PXthdHRhY2hGaWxlfSBpZD1cImZpbGVJbnB1dFwiIC8+XHJcbiAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuXCIgb246Y2xpY2s9e2F0dGFjaEZpbGVUcmlnZ2VyfT5BdHRhY2ggRmlsZTwvYnV0dG9uPlxyXG4gICAgICAgICAgeyNpZiBpcGZzRGFlbW9uUnVubmluZ31cclxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJmaWxlXCIgb246aW5wdXQ9e2F0dGFjaEZpbGVJUEZTfSBpZD1cImZpbGVJbnB1dElQRlNcIiAvPlxyXG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuXCIgb246Y2xpY2s9e2F0dGFjaEZpbGVJUEZTVHJpZ2dlcn0+XHJcbiAgICAgICAgICAgICAgQXR0YWNoIEZpbGUgdXNpbmcgSVBGU1xyXG4gICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgIHsvaWZ9XHJcbiAgICAgICAgICB7I2lmIGRhdERhZW1vblJ1bm5pbmd9XHJcbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiZmlsZVwiIG9uOmlucHV0PXthdHRhY2hGaWxlREFUfSBpZD1cImZpbGVJbnB1dERBVFwiIC8+XHJcbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJidG5cIiBvbjpjbGljaz17YXR0YWNoRmlsZURBVFRyaWdnZXJ9PlxyXG4gICAgICAgICAgICAgIEF0dGFjaCBGaWxlIHVzaW5nIERhdFxyXG4gICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgIHsvaWZ9XHJcbiAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5IGZsb2F0LXJpZ2h0XCIgb246Y2xpY2s9e3ByZXZpZXd9PlxyXG4gICAgICAgICAgICBQcmV2aWV3XHJcbiAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgezplbHNlfVxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW4gY29sLW1kLTEyXCI+XHJcbiAgICAgICAgICA8UHJldmlld1xyXG4gICAgICAgICAgICB7Y2hhbm5lbH1cclxuICAgICAgICAgICAge3RpdGxlfVxyXG4gICAgICAgICAgICB7c3VtbWFyeX1cclxuICAgICAgICAgICAge2NvbnRlbnR9XHJcbiAgICAgICAgICAgIHtjb250ZW50V2FybmluZ31cclxuICAgICAgICAgICAge3RodW1ibmFpbH0gLz5cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJkaXZpZGVyXCIgLz5cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW5zXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW4gY29sLW1kLTEyIGNvbC1sZy0xMFwiPlxyXG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibGFiZWwgbGFiZWwtd2FybmluZ1wiPlxyXG4gICAgICAgICAgICAgICAgVGhpcyBtZXNzYWdlIHdpbGwgYmUgcHVibGljIGFuZCBjYW4ndCBiZSBlZGl0ZWQgb3IgZGVsZXRlZFxyXG4gICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2x1bW4gY29sLW1kLTEyIGNvbC1sZy0yXCI+XHJcbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0blwiIG9uOmNsaWNrPXsoKSA9PiAoc2hvd1ByZXZpZXcgPSBmYWxzZSl9PlxyXG4gICAgICAgICAgICAgICAgR28gQmFja1xyXG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgIDxidXR0b25cclxuICAgICAgICAgICAgICAgIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCJcclxuICAgICAgICAgICAgICAgIGNsYXNzOmxvYWRpbmc9e3Bvc3Rpbmd9XHJcbiAgICAgICAgICAgICAgICBkaXNhYmxlZD17IWVycm9yICYmIHR5cGVvZiBtc2cua2V5ID09ICdzdHJpbmcnfVxyXG4gICAgICAgICAgICAgICAgb246Y2xpY2s9e3Bvc3R9PlxyXG4gICAgICAgICAgICAgICAgUG9zdFxyXG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICB7L2lmfVxyXG4gICAgPC9kaXY+XHJcbiAgPC9kaXY+XHJcbjwvZGl2PlxyXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBb1FFLFlBQVksZUFBQyxDQUFDLEFBQ1osTUFBTSxDQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQUFDcEMsQ0FBQyxBQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGVBQUMsQ0FBQyxBQUNsQixPQUFPLENBQUUsSUFBSSxBQUNmLENBQUMsQUFFRCxrQkFBa0IsZUFBQyxDQUFDLEFBQ2xCLFVBQVUsQ0FBRSxLQUFLLEFBQ25CLENBQUMifQ== */";
	append(document_1.head, style);
}

// (277:6) {#if msg}
function create_if_block_5(ctx) {
	var if_block_anchor;

	function select_block_type(ctx) {
		if (ctx.error) return create_if_block_6;
		return create_else_block_1;
	}

	var current_block_type = select_block_type(ctx);
	var if_block = current_block_type(ctx);

	return {
		c: function create() {
			if_block.c();
			if_block_anchor = empty();
		},

		m: function mount(target, anchor) {
			if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
		},

		p: function update(changed, ctx) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(changed, ctx);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);
				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},

		d: function destroy(detaching) {
			if_block.d(detaching);

			if (detaching) {
				detach(if_block_anchor);
			}
		}
	};
}

// (280:8) {:else}
function create_else_block_1(ctx) {
	var div, t0, a, t1, a_href_value;

	return {
		c: function create() {
			div = element("div");
			t0 = text("Your blog post has been posted. Do you want to\r\n            ");
			a = element("a");
			t1 = text("Check it out?");
			attr(a, "target", "_blank");
			attr(a, "href", a_href_value = "?thread=" + ctx.encodeURIComponent(ctx.msg.key) + "#/thread");
			add_location(a, file, 282, 12, 7164);
			attr(div, "class", "toast toast-success");
			add_location(div, file, 280, 10, 7057);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, a);
			append(a, t1);
		},

		p: function update(changed, ctx) {
			if ((changed.msg) && a_href_value !== (a_href_value = "?thread=" + ctx.encodeURIComponent(ctx.msg.key) + "#/thread")) {
				attr(a, "href", a_href_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (278:8) {#if error}
function create_if_block_6(ctx) {
	var div, t;

	return {
		c: function create() {
			div = element("div");
			t = text(ctx.msg);
			attr(div, "class", "toast toast-error");
			add_location(div, file, 278, 10, 6986);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, t);
		},

		p: function update(changed, ctx) {
			if (changed.msg) {
				set_data(t, ctx.msg);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (374:6) {:else}
function create_else_block(ctx) {
	var div4, t0, div0, t1, div3, div1, span, t3, div2, button0, t5, button1, t6, button1_disabled_value, current, dispose;

	var preview_1 = new ctx.Preview({
		props: {
		channel: ctx.channel,
		title: ctx.title,
		summary: ctx.summary,
		content: ctx.content,
		contentWarning: ctx.contentWarning,
		thumbnail: ctx.thumbnail
	},
		$$inline: true
	});

	return {
		c: function create() {
			div4 = element("div");
			preview_1.$$.fragment.c();
			t0 = space();
			div0 = element("div");
			t1 = space();
			div3 = element("div");
			div1 = element("div");
			span = element("span");
			span.textContent = "This message will be public and can't be edited or deleted";
			t3 = space();
			div2 = element("div");
			button0 = element("button");
			button0.textContent = "Go Back";
			t5 = space();
			button1 = element("button");
			t6 = text("Post");
			attr(div0, "class", "divider");
			add_location(div0, file, 382, 10, 10796);
			attr(span, "class", "label label-warning");
			add_location(span, file, 385, 14, 10922);
			attr(div1, "class", "column col-md-12 col-lg-10");
			add_location(div1, file, 384, 12, 10866);
			attr(button0, "class", "btn");
			add_location(button0, file, 390, 14, 11144);
			attr(button1, "class", "btn btn-primary");
			button1.disabled = button1_disabled_value = !ctx.error && typeof ctx.msg.key == 'string';
			toggle_class(button1, "loading", ctx.posting);
			add_location(button1, file, 393, 14, 11269);
			attr(div2, "class", "column col-md-12 col-lg-2");
			add_location(div2, file, 389, 12, 11089);
			attr(div3, "class", "columns");
			add_location(div3, file, 383, 10, 10831);
			attr(div4, "class", "column col-md-12");
			add_location(div4, file, 374, 8, 10586);

			dispose = [
				listen(button0, "click", ctx.click_handler),
				listen(button1, "click", ctx.post)
			];
		},

		m: function mount(target, anchor) {
			insert(target, div4, anchor);
			mount_component(preview_1, div4, null);
			append(div4, t0);
			append(div4, div0);
			append(div4, t1);
			append(div4, div3);
			append(div3, div1);
			append(div1, span);
			append(div3, t3);
			append(div3, div2);
			append(div2, button0);
			append(div2, t5);
			append(div2, button1);
			append(button1, t6);
			current = true;
		},

		p: function update(changed, ctx) {
			var preview_1_changes = {};
			if (changed.channel) preview_1_changes.channel = ctx.channel;
			if (changed.title) preview_1_changes.title = ctx.title;
			if (changed.summary) preview_1_changes.summary = ctx.summary;
			if (changed.content) preview_1_changes.content = ctx.content;
			if (changed.contentWarning) preview_1_changes.contentWarning = ctx.contentWarning;
			if (changed.thumbnail) preview_1_changes.thumbnail = ctx.thumbnail;
			preview_1.$set(preview_1_changes);

			if ((!current || changed.error || changed.msg) && button1_disabled_value !== (button1_disabled_value = !ctx.error && typeof ctx.msg.key == 'string')) {
				button1.disabled = button1_disabled_value;
			}

			if (changed.posting) {
				toggle_class(button1, "loading", ctx.posting);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(preview_1.$$.fragment, local);

			current = true;
		},

		o: function outro(local) {
			transition_out(preview_1.$$.fragment, local);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div4);
			}

			destroy_component(preview_1);

			run_all(dispose);
		}
	};
}

// (291:6) {#if !showPreview}
function create_if_block(ctx) {
	var div1, label0, t1, input0, t2, label1, t4, input1, t5, label2, t7, textarea0, t8, label3, t10, textarea1, t11, div0, button0, t13, t14, t15, input2, t16, button1, t18, input3, t19, button2, t21, t22, t23, button3, div1_intro, div1_outro, current, dispose;

	var if_block0 = (ctx.showContentWarningField) && create_if_block_4(ctx);

	var if_block1 = (ctx.thumbnail) && create_if_block_3(ctx);

	var if_block2 = (ctx.ipfsDaemonRunning) && create_if_block_2(ctx);

	var if_block3 = (ctx.datDaemonRunning) && create_if_block_1(ctx);

	return {
		c: function create() {
			div1 = element("div");
			label0 = element("label");
			label0.textContent = "Channel";
			t1 = space();
			input0 = element("input");
			t2 = space();
			label1 = element("label");
			label1.textContent = "Title";
			t4 = space();
			input1 = element("input");
			t5 = space();
			label2 = element("label");
			label2.textContent = "Summary";
			t7 = space();
			textarea0 = element("textarea");
			t8 = space();
			label3 = element("label");
			label3.textContent = "Content";
			t10 = space();
			textarea1 = element("textarea");
			t11 = space();
			div0 = element("div");
			button0 = element("button");
			button0.textContent = "CW";
			t13 = space();
			if (if_block0) if_block0.c();
			t14 = space();
			if (if_block1) if_block1.c();
			t15 = space();
			input2 = element("input");
			t16 = space();
			button1 = element("button");
			button1.textContent = "Attach Thumbnail Image";
			t18 = space();
			input3 = element("input");
			t19 = space();
			button2 = element("button");
			button2.textContent = "Attach File";
			t21 = space();
			if (if_block2) if_block2.c();
			t22 = space();
			if (if_block3) if_block3.c();
			t23 = space();
			button3 = element("button");
			button3.textContent = "Preview";
			attr(label0, "class", "form-label");
			attr(label0, "for", "channel");
			add_location(label0, file, 292, 10, 7450);
			attr(input0, "class", "form-input");
			attr(input0, "type", "text");
			attr(input0, "id", "channel");
			attr(input0, "placeholder", "channel");
			add_location(input0, file, 293, 10, 7517);
			attr(label1, "class", "form-label");
			attr(label1, "for", "title");
			add_location(label1, file, 300, 10, 7692);
			attr(input1, "class", "form-input");
			attr(input1, "type", "text");
			attr(input1, "id", "title");
			attr(input1, "placeholder", "title");
			add_location(input1, file, 301, 10, 7755);
			attr(label2, "class", "form-label");
			attr(label2, "for", "summary");
			add_location(label2, file, 308, 10, 7924);
			attr(textarea0, "class", "form-input svelte-1irvyx7");
			attr(textarea0, "id", "summary");
			attr(textarea0, "placeholder", "Type in your summary");
			attr(textarea0, "rows", "5");
			toggle_class(textarea0, "file-on-top", ctx.fileOnTop);
			add_location(textarea0, file, 309, 10, 7991);
			attr(label3, "class", "form-label");
			attr(label3, "for", "content");
			add_location(label3, file, 319, 10, 8358);
			attr(textarea1, "class", "form-input svelte-1irvyx7");
			attr(textarea1, "id", "content");
			attr(textarea1, "placeholder", "Type in your blog post content");
			attr(textarea1, "rows", "20");
			toggle_class(textarea1, "file-on-top", ctx.fileOnTop);
			add_location(textarea1, file, 320, 10, 8425);
			attr(button0, "class", "btn btn-link");
			add_location(button0, file, 330, 12, 8840);
			attr(div0, "class", "d-block m-2");
			add_location(div0, file, 329, 10, 8801);
			attr(input2, "type", "file");
			attr(input2, "id", "thumbnailInput");
			attr(input2, "class", "svelte-1irvyx7");
			add_location(input2, file, 351, 10, 9571);
			attr(button1, "class", "btn");
			add_location(button1, file, 352, 10, 9651);
			attr(input3, "type", "file");
			attr(input3, "id", "fileInput");
			attr(input3, "class", "svelte-1irvyx7");
			add_location(input3, file, 355, 10, 9774);
			attr(button2, "class", "btn");
			add_location(button2, file, 356, 10, 9844);
			attr(button3, "class", "btn btn-primary float-right");
			add_location(button3, file, 369, 10, 10440);
			attr(div1, "class", "form-group");
			add_location(div1, file, 291, 8, 7395);

			dispose = [
				listen(input0, "input", ctx.input0_input_handler),
				listen(input1, "input", ctx.input1_input_handler),
				listen(textarea0, "input", ctx.textarea0_input_handler),
				listen(textarea0, "dragover", stop_propagation(prevent_default(ctx.dragOver))),
				listen(textarea0, "dragleave", stop_propagation(prevent_default(ctx.dragLeave))),
				listen(textarea1, "input", ctx.textarea1_input_handler),
				listen(textarea1, "dragover", stop_propagation(prevent_default(ctx.dragOver))),
				listen(textarea1, "dragleave", stop_propagation(prevent_default(ctx.dragLeave))),
				listen(button0, "click", ctx.toggleContentWarning),
				listen(input2, "input", ctx.attachThumbnail),
				listen(button1, "click", ctx.attachThumbnailTrigger),
				listen(input3, "input", ctx.attachFile),
				listen(button2, "click", ctx.attachFileTrigger),
				listen(button3, "click", ctx.preview)
			];
		},

		m: function mount(target, anchor) {
			insert(target, div1, anchor);
			append(div1, label0);
			append(div1, t1);
			append(div1, input0);

			input0.value = ctx.channel;

			append(div1, t2);
			append(div1, label1);
			append(div1, t4);
			append(div1, input1);

			input1.value = ctx.title;

			append(div1, t5);
			append(div1, label2);
			append(div1, t7);
			append(div1, textarea0);

			textarea0.value = ctx.summary;

			append(div1, t8);
			append(div1, label3);
			append(div1, t10);
			append(div1, textarea1);

			textarea1.value = ctx.content;

			append(div1, t11);
			append(div1, div0);
			append(div0, button0);
			append(div0, t13);
			if (if_block0) if_block0.m(div0, null);
			append(div1, t14);
			if (if_block1) if_block1.m(div1, null);
			append(div1, t15);
			append(div1, input2);
			append(div1, t16);
			append(div1, button1);
			append(div1, t18);
			append(div1, input3);
			append(div1, t19);
			append(div1, button2);
			append(div1, t21);
			if (if_block2) if_block2.m(div1, null);
			append(div1, t22);
			if (if_block3) if_block3.m(div1, null);
			append(div1, t23);
			append(div1, button3);
			current = true;
		},

		p: function update(changed, ctx) {
			if (changed.channel && (input0.value !== ctx.channel)) input0.value = ctx.channel;
			if (changed.title && (input1.value !== ctx.title)) input1.value = ctx.title;
			if (changed.summary) textarea0.value = ctx.summary;

			if (changed.fileOnTop) {
				toggle_class(textarea0, "file-on-top", ctx.fileOnTop);
			}

			if (changed.content) textarea1.value = ctx.content;

			if (changed.fileOnTop) {
				toggle_class(textarea1, "file-on-top", ctx.fileOnTop);
			}

			if (ctx.showContentWarningField) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_4(ctx);
					if_block0.c();
					if_block0.m(div0, null);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.thumbnail) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_3(ctx);
					if_block1.c();
					if_block1.m(div1, t15);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (ctx.ipfsDaemonRunning) {
				if (!if_block2) {
					if_block2 = create_if_block_2(ctx);
					if_block2.c();
					if_block2.m(div1, t22);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (ctx.datDaemonRunning) {
				if (!if_block3) {
					if_block3 = create_if_block_1(ctx);
					if_block3.c();
					if_block3.m(div1, t23);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}
		},

		i: function intro(local) {
			if (current) return;
			add_render_callback(() => {
				if (div1_outro) div1_outro.end(1);
				if (!div1_intro) div1_intro = create_in_transition(div1, ctx.slide, {});
				div1_intro.start();
			});

			current = true;
		},

		o: function outro(local) {
			if (div1_intro) div1_intro.invalidate();

			div1_outro = create_out_transition(div1, ctx.slide, {});

			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div1);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();

			if (detaching) {
				if (div1_outro) div1_outro.end();
			}

			run_all(dispose);
		}
	};
}

// (334:12) {#if showContentWarningField}
function create_if_block_4(ctx) {
	var input, dispose;

	return {
		c: function create() {
			input = element("input");
			attr(input, "type", "text");
			attr(input, "size", "50");
			attr(input, "placeholder", "Describe your content warning (leave empty to no\r\n                use it)");
			add_location(input, file, 334, 14, 9001);
			dispose = listen(input, "input", ctx.input_input_handler);
		},

		m: function mount(target, anchor) {
			insert(target, input, anchor);

			input.value = ctx.contentWarning;
		},

		p: function update(changed, ctx) {
			if (changed.contentWarning && (input.value !== ctx.contentWarning)) input.value = ctx.contentWarning;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(input);
			}

			dispose();
		}
	};
}

// (343:10) {#if thumbnail}
function create_if_block_3(ctx) {
	var div, p, t_1, img, img_src_value;

	return {
		c: function create() {
			div = element("div");
			p = element("p");
			p.textContent = "Thumbnail";
			t_1 = space();
			img = element("img");
			add_location(p, file, 344, 14, 9335);
			attr(img, "class", "thumbnail-preview svelte-1irvyx7");
			attr(img, "src", img_src_value = "http://localhost:8989/blobs/get/" + ctx.thumbnail);
			attr(img, "alt", "post thumbnail");
			add_location(img, file, 345, 14, 9367);
			attr(div, "class", "d-block m-2");
			add_location(div, file, 343, 12, 9294);
		},

		m: function mount(target, anchor) {
			insert(target, div, anchor);
			append(div, p);
			append(div, t_1);
			append(div, img);
		},

		p: function update(changed, ctx) {
			if ((changed.thumbnail) && img_src_value !== (img_src_value = "http://localhost:8989/blobs/get/" + ctx.thumbnail)) {
				attr(img, "src", img_src_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (358:10) {#if ipfsDaemonRunning}
function create_if_block_2(ctx) {
	var input, t, button, dispose;

	return {
		c: function create() {
			input = element("input");
			t = space();
			button = element("button");
			button.textContent = "Attach File using IPFS";
			attr(input, "type", "file");
			attr(input, "id", "fileInputIPFS");
			attr(input, "class", "svelte-1irvyx7");
			add_location(input, file, 358, 12, 9962);
			attr(button, "class", "btn");
			add_location(button, file, 359, 12, 10042);

			dispose = [
				listen(input, "input", ctx.attachFileIPFS),
				listen(button, "click", ctx.attachFileIPFSTrigger)
			];
		},

		m: function mount(target, anchor) {
			insert(target, input, anchor);
			insert(target, t, anchor);
			insert(target, button, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(input);
				detach(t);
				detach(button);
			}

			run_all(dispose);
		}
	};
}

// (364:10) {#if datDaemonRunning}
function create_if_block_1(ctx) {
	var input, t, button, dispose;

	return {
		c: function create() {
			input = element("input");
			t = space();
			button = element("button");
			button.textContent = "Attach File using Dat";
			attr(input, "type", "file");
			attr(input, "id", "fileInputDAT");
			attr(input, "class", "svelte-1irvyx7");
			add_location(input, file, 364, 12, 10221);
			attr(button, "class", "btn");
			add_location(button, file, 365, 12, 10299);

			dispose = [
				listen(input, "input", ctx.attachFileDAT),
				listen(button, "click", ctx.attachFileDATTrigger)
			];
		},

		m: function mount(target, anchor) {
			insert(target, input, anchor);
			insert(target, t, anchor);
			insert(target, button, anchor);
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(input);
				detach(t);
				detach(button);
			}

			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	var div2, div1, div0, t, current_block_type_index, if_block1, current;

	var if_block0 = (ctx.msg) && create_if_block_5(ctx);

	var if_block_creators = [
		create_if_block,
		create_else_block
	];

	var if_blocks = [];

	function select_block_type_1(ctx) {
		if (!ctx.showPreview) return 0;
		return 1;
	}

	current_block_type_index = select_block_type_1(ctx);
	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c: function create() {
			div2 = element("div");
			div1 = element("div");
			div0 = element("div");
			if (if_block0) if_block0.c();
			t = space();
			if_block1.c();
			attr(div0, "class", "column");
			add_location(div0, file, 275, 4, 6916);
			attr(div1, "class", "columns");
			add_location(div1, file, 274, 2, 6889);
			attr(div2, "class", "container");
			add_location(div2, file, 273, 0, 6862);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div1);
			append(div1, div0);
			if (if_block0) if_block0.m(div0, null);
			append(div0, t);
			if_blocks[current_block_type_index].m(div0, null);
			current = true;
		},

		p: function update(changed, ctx) {
			if (ctx.msg) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_5(ctx);
					if_block0.c();
					if_block0.m(div0, t);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type_1(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block1 = if_blocks[current_block_type_index];
				if (!if_block1) {
					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block1.c();
				}
				transition_in(if_block1, 1);
				if_block1.m(div0, null);
			}
		},

		i: function intro(local) {
			if (current) return;
			transition_in(if_block1);
			current = true;
		},

		o: function outro(local) {
			transition_out(if_block1);
			current = false;
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(div2);
			}

			if (if_block0) if_block0.d();
			if_blocks[current_block_type_index].d();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $routeParams;

	const { onMount } = require("svelte");
  const drop = require("drag-and-drop-files");
  const { slide } = require("svelte/transition");
  const { navigate, routeParams, reconnect } = require("../../../utils.js"); validate_store(routeParams, 'routeParams'); component_subscribe($$self, routeParams, $$value => { $routeParams = $$value; $$invalidate('$routeParams', $routeParams) });
  const { getPref } = require("../../../prefs.js");
  const AvatarChip = require("../../../parts/AvatarChip.svelte");
  const Preview = require("./Preview.svelte");

  let showPreview = false;
  let msg = false;
  let error = false;
  let posting = false;

  let channel = $routeParams.channel || "";
  let content = $routeParams.content || "";
  let summary = $routeParams.summary || "";
  let title = $routeParams.title || "";
  let thumbnail = $routeParams.thumbnail;
  let fileOnTop = false;
  let pull = hermiebox.modules.pullStream;
  let fileReader = hermiebox.modules.pullFileReader;
  let sbot = hermiebox.sbot;
  let ipfsDaemonRunning = false;
  let datDaemonRunning = false;

  document.title = `Patchfox - compose new blog post`;

  onMount(() => {
    $$invalidate('error', error = false);
    $$invalidate('msg', msg = "");

    // this code could be in some better/smarter place.
    // e.dataTransfer.getData('url'); from images in the browser window

    drop(document.getElementById("content"), files => readFileAndAttach(files));
    checkIpfsDaemon();
    checkDatDaemon();
  });

  const checkIpfsDaemon = () => {
    let port = getPref("ipfsPort", 5001);
    fetch(`http://127.0.0.1:${port}/api/v0/config/show`).then(data => {
      $$invalidate('ipfsDaemonRunning', ipfsDaemonRunning = true);
    });
  };

  const checkDatDaemon = () => {
    $$invalidate('datDaemonRunning', datDaemonRunning = false);
  };

  const readFileAndAttach = files => {
    $$invalidate('error', error = false);
    $$invalidate('msg', msg = "");

    if (files.length == 0) {
      $$invalidate('fileOnTop', fileOnTop = false);
      console.log("this is not a file");
      return false;
    }

    var first = files[0];
    console.log(first);

    if (!first.type.startsWith("image")) {
      $$invalidate('error', error = true);
      $$invalidate('msg', msg = `You can only drag & drop image, this file is a ${first.type}`);
      return false;
    }

    if (first.size >= 5000000) {
      $$invalidate('error', error = true);
      $$invalidate('msg', msg = `File too large: ${Math.floor(
        first.size / 1048576,
        2
      )}mb when max size is 5mb`);
      return false;
    }

    pull(
      fileReader(first),
      sbot.blobs.add(function(err, hash) {
        // 'hash' is the hash-id of the blob
        if (err) {
          $$invalidate('error', error = true);
          $$invalidate('msg', msg = "Couldn't attach file: " + err);
        } else {
          $$invalidate('content', content += ` ![${first.name}](${hash})`);
        }
        $$invalidate('fileOnTop', fileOnTop = false);
      })
    );
  };

  const post = async ev => {
    ev.stopPropagation();
    ev.preventDefault();

    if (!posting) {
      $$invalidate('posting', posting = true);

      if (channel.startsWith("#")) {
        $$invalidate('channel', channel = channel.slice(1));
      }

      try {
        $$invalidate('msg', msg = await ssb.newBlogPost({
          content,
          summary,
          channel,
          title,
          thumbnail,
          contentWarning: contentWarning.length > 0 ? contentWarning : undefined
        }));
        $$invalidate('posting', posting = false);
        console.log("posted", msg);
        window.scrollTo(0, 0);
      } catch (n) {
        $$invalidate('error', error = true);
        $$invalidate('msg', msg = `Couldn't post your message: ${n}`);
        window.scrollTo(0, 0);

        if (msg.message == "stream is closed") {
          $$invalidate('msg', msg += ". We lost connection to sbot. We'll try to restablish it...");

          reconnect()
            .then(() => {
              $$invalidate('showPreview', showPreview = false);
              $$invalidate('posting', posting = false);
              $$invalidate('error', error = false);
              $$invalidate('msg', msg = "Connection to sbot reestablished. Try posting again");
            })
            .catch(err => {
              saveToURL();
              $$invalidate('msg', msg = `Sorry, couldn't reconnect to sbot:${err}. Try reloading the page. Your content has been saved to the URL`);
            });
        }
      }
    }
  };

  const preview = ev => {
    $$invalidate('showPreview', showPreview = true);
  };

  const saveToURL = ev => {
    window.location.search = `?summary=${encodeURIComponent(
      summary
    )}&title=${encodeURIComponent(title)}&content=${encodeURIComponent(
      content
    )}&channel=${encodeURIComponent(channel)}&thumbnail=${encodeURIComponent(
      thumbnail
    )}`;
  };

  const dragOver = ev => {
    $$invalidate('fileOnTop', fileOnTop = true);
  };

  const dragLeave = ev => {
    $$invalidate('fileOnTop', fileOnTop = false);
  };

  const attachFileTrigger = () => {
    document.getElementById("fileInput").click();
  };

  const attachThumbnailTrigger = () => {
    document.getElementById("thumbnailInput").click();
  };

  const attachFileIPFSTrigger = () => {
    document.getElementById("fileInputIPFS").click();
  };

  const attachFileDATTrigger = () => {
    document.getElementById("fileInputDAT").click();
  };

  const attachFile = ev => {
    const files = ev.target.files;
    readFileAndAttach(files);
  };

  const attachThumbnail = ev => {
    const files = ev.target.files;
    readFileAndAttachThumbnail(files);
  };

  const readFileAndAttachThumbnail = files => {
    $$invalidate('error', error = false);
    $$invalidate('msg', msg = "");

    if (files.length == 0) {
      console.log("this is not a file");
      return false;
    }

    var first = files[0];
    console.log(first);

    if (!first.type.startsWith("image")) {
      $$invalidate('error', error = true);
      $$invalidate('msg', msg = `You can use images as thumbnail, this file is a ${first.type}`);
      return false;
    }

    if (first.size >= 5000000) {
      $$invalidate('error', error = true);
      $$invalidate('msg', msg = `File too large: ${Math.floor(
        first.size / 1048576,
        2
      )}mb when max size is 5mb`);
      return false;
    }

    pull(
      fileReader(first),
      sbot.blobs.add(function(err, hash) {
        // 'hash' is the hash-id of the blob
        if (err) {
          $$invalidate('error', error = true);
          $$invalidate('msg', msg = "Couldn't add file: " + err + " as thumbnail");
        } else {
          $$invalidate('thumbnail', thumbnail = hash);
        }
      })
    );
  };

  const attachFileIPFS = ev => {
    const files = ev.target.files;
    readFileAndAttachIPFS(files);
  };

  const attachFileDAT = ev => {
    const files = ev.target.files;
    readFileAndAttachDAT(files);
  };

  const readFileAndAttachIPFS = async files => {
    $$invalidate('error', error = false);
    $$invalidate('msg', msg = "");

    var ipfs = window.IpfsHttpClient("127.0.0.1", "5001");
    const results = await ipfs.add(files[0]);

    console.log("added via IPFS", results);
    $$invalidate('content', content += ` [${results[0].path}](ipfs://${results[0].hash})`);
  };

  let showContentWarningField = false;

  const toggleContentWarning = () =>
    { const $$result = (showContentWarningField = !showContentWarningField); $$invalidate('showContentWarningField', showContentWarningField); return $$result; };

  let contentWarning = "";

	function input0_input_handler() {
		channel = this.value;
		$$invalidate('channel', channel);
	}

	function input1_input_handler() {
		title = this.value;
		$$invalidate('title', title);
	}

	function textarea0_input_handler() {
		summary = this.value;
		$$invalidate('summary', summary);
	}

	function textarea1_input_handler() {
		content = this.value;
		$$invalidate('content', content);
	}

	function input_input_handler() {
		contentWarning = this.value;
		$$invalidate('contentWarning', contentWarning);
	}

	function click_handler() {
		const $$result = (showPreview = false);
		$$invalidate('showPreview', showPreview);
		return $$result;
	}

	return {
		slide,
		routeParams,
		Preview,
		showPreview,
		msg,
		error,
		posting,
		channel,
		content,
		summary,
		title,
		thumbnail,
		fileOnTop,
		ipfsDaemonRunning,
		datDaemonRunning,
		post,
		preview,
		dragOver,
		dragLeave,
		attachFileTrigger,
		attachThumbnailTrigger,
		attachFileIPFSTrigger,
		attachFileDATTrigger,
		attachFile,
		attachThumbnail,
		attachFileIPFS,
		attachFileDAT,
		showContentWarningField,
		toggleContentWarning,
		contentWarning,
		encodeURIComponent,
		input0_input_handler,
		input1_input_handler,
		textarea0_input_handler,
		textarea1_input_handler,
		input_input_handler,
		click_handler
	};
}

class ComposeBlog extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document_1.getElementById("svelte-1irvyx7-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, []);
	}
}

module.exports = ComposeBlog;

},{"../../../parts/AvatarChip.svelte":26,"../../../prefs.js":28,"../../../utils.js":30,"./Preview.svelte":50,"drag-and-drop-files":2,"svelte":7,"svelte/internal":8,"svelte/transition":10}],50:[function(require,module,exports){
/* Preview.svelte generated by Svelte v3.7.1 */
"use strict";

const {
	HtmlTag,
	SvelteComponentDev,
	add_location,
	append,
	attr,
	detach,
	element,
	init,
	insert,
	noop,
	safe_not_equal,
	set_data,
	space,
	text
} = require("svelte/internal");

const file = "Preview.svelte";

function add_css() {
	var style = element("style");
	style.id = 'svelte-v1gwe5-style';
	style.textContent = ".thumbnail-preview.svelte-v1gwe5{max-height:200px}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJldmlldy5zdmVsdGUiLCJzb3VyY2VzIjpbIlByZXZpZXcuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XHJcbmV4cG9ydCBsZXQgY2hhbm5lbDtcclxuZXhwb3J0IGxldCB0aXRsZTtcclxuZXhwb3J0IGxldCBjb250ZW50V2FybmluZztcclxuZXhwb3J0IGxldCBjb250ZW50O1xyXG5leHBvcnQgbGV0IHN1bW1hcnk7XHJcbmV4cG9ydCBsZXQgdGh1bWJuYWlsO1xyXG48L3NjcmlwdD5cclxuXHJcbjxzdHlsZT5cclxuICAudGh1bWJuYWlsLXByZXZpZXcge1xyXG4gICAgbWF4LWhlaWdodDogMjAwcHg7XHJcbiAgfVxyXG48L3N0eWxlPlxyXG5cclxuPGgyPlBvc3QgcHJldmlldzwvaDI+XHJcbnsjaWYgY2hhbm5lbCB8fCBjb250ZW50V2FybmluZy5sZW5ndGggPiAwIHx8IHRpdGxlIHx8IHRodW1ibmFpbH1cclxuICA8YmxvY2txdW90ZT5cclxuICAgIHsjaWYgY2hhbm5lbH1cclxuICAgICAgPHA+XHJcbiAgICAgICAgPGI+Q2hhbm5lbDo8L2I+XHJcbiAgICAgICAge2NoYW5uZWwuc3RhcnRzV2l0aCgnIycpID8gY2hhbm5lbC5zbGljZSgxKSA6IGNoYW5uZWx9XHJcbiAgICAgIDwvcD5cclxuICAgIHsvaWZ9XHJcbiAgICB7I2lmIGNvbnRlbnRXYXJuaW5nLmxlbmd0aCA+IDB9XHJcbiAgICAgIDxwPlxyXG4gICAgICAgIDxiPkNvbnRlbnQgV2FybmluZzo8L2I+XHJcbiAgICAgICAge2NvbnRlbnRXYXJuaW5nfVxyXG4gICAgICA8L3A+XHJcbiAgICB7L2lmfVxyXG4gICAgeyNpZiB0aXRsZX1cclxuICAgICAgPHA+XHJcbiAgICAgICAgPGI+dGl0bGU6PC9iPlxyXG4gICAgICAgIHt0aXRsZX1cclxuICAgICAgPC9wPlxyXG4gICAgey9pZn1cclxuICAgIHsjaWYgc3VtbWFyeX1cclxuICAgICAgPHA+XHJcbiAgICAgICAgPGI+U3VtbWFyeTo8L2I+XHJcbiAgICAgICAge0BodG1sIHNzYi5tYXJrZG93bihzdW1tYXJ5KX1cclxuICAgICAgPC9wPlxyXG4gICAgey9pZn1cclxuICAgIHsjaWYgdGh1bWJuYWlsfVxyXG4gICAgICA8cD5cclxuICAgICAgICA8Yj5UaHVtYm5haWw6PC9iPlxyXG4gICAgICAgIDxpbWdcclxuICAgICAgICAgIGNsYXNzPVwidGh1bWJuYWlsLXByZXZpZXdcIlxyXG4gICAgICAgICAgc3JjPVwiaHR0cDovL2xvY2FsaG9zdDo4OTg5L2Jsb2JzL2dldC97dGh1bWJuYWlsfVwiXHJcbiAgICAgICAgICBhbHQ9XCJwb3N0IHRodW1ibmFpbFwiIC8+XHJcbiAgICAgIDwvcD5cclxuICAgIHsvaWZ9XHJcbiAgPC9ibG9ja3F1b3RlPlxyXG57L2lmfVxyXG57QGh0bWwgc3NiLm1hcmtkb3duKGNvbnRlbnQpfVxyXG5cclxuXHJcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFVRSxrQkFBa0IsY0FBQyxDQUFDLEFBQ2xCLFVBQVUsQ0FBRSxLQUFLLEFBQ25CLENBQUMifQ== */";
	append(document.head, style);
}

// (17:0) {#if channel || contentWarning.length > 0 || title || thumbnail}
function create_if_block(ctx) {
	var blockquote, t0, t1, t2, t3;

	var if_block0 = (ctx.channel) && create_if_block_5(ctx);

	var if_block1 = (ctx.contentWarning.length > 0) && create_if_block_4(ctx);

	var if_block2 = (ctx.title) && create_if_block_3(ctx);

	var if_block3 = (ctx.summary) && create_if_block_2(ctx);

	var if_block4 = (ctx.thumbnail) && create_if_block_1(ctx);

	return {
		c: function create() {
			blockquote = element("blockquote");
			if (if_block0) if_block0.c();
			t0 = space();
			if (if_block1) if_block1.c();
			t1 = space();
			if (if_block2) if_block2.c();
			t2 = space();
			if (if_block3) if_block3.c();
			t3 = space();
			if (if_block4) if_block4.c();
			add_location(blockquote, file, 17, 2, 321);
		},

		m: function mount(target, anchor) {
			insert(target, blockquote, anchor);
			if (if_block0) if_block0.m(blockquote, null);
			append(blockquote, t0);
			if (if_block1) if_block1.m(blockquote, null);
			append(blockquote, t1);
			if (if_block2) if_block2.m(blockquote, null);
			append(blockquote, t2);
			if (if_block3) if_block3.m(blockquote, null);
			append(blockquote, t3);
			if (if_block4) if_block4.m(blockquote, null);
		},

		p: function update(changed, ctx) {
			if (ctx.channel) {
				if (if_block0) {
					if_block0.p(changed, ctx);
				} else {
					if_block0 = create_if_block_5(ctx);
					if_block0.c();
					if_block0.m(blockquote, t0);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (ctx.contentWarning.length > 0) {
				if (if_block1) {
					if_block1.p(changed, ctx);
				} else {
					if_block1 = create_if_block_4(ctx);
					if_block1.c();
					if_block1.m(blockquote, t1);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (ctx.title) {
				if (if_block2) {
					if_block2.p(changed, ctx);
				} else {
					if_block2 = create_if_block_3(ctx);
					if_block2.c();
					if_block2.m(blockquote, t2);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (ctx.summary) {
				if (if_block3) {
					if_block3.p(changed, ctx);
				} else {
					if_block3 = create_if_block_2(ctx);
					if_block3.c();
					if_block3.m(blockquote, t3);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}

			if (ctx.thumbnail) {
				if (if_block4) {
					if_block4.p(changed, ctx);
				} else {
					if_block4 = create_if_block_1(ctx);
					if_block4.c();
					if_block4.m(blockquote, null);
				}
			} else if (if_block4) {
				if_block4.d(1);
				if_block4 = null;
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(blockquote);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			if (if_block4) if_block4.d();
		}
	};
}

// (19:4) {#if channel}
function create_if_block_5(ctx) {
	var p, b, t1, t2_value = ctx.channel.startsWith('#') ? ctx.channel.slice(1) : ctx.channel, t2;

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "Channel:";
			t1 = space();
			t2 = text(t2_value);
			add_location(b, file, 20, 8, 373);
			add_location(p, file, 19, 6, 360);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t1);
			append(p, t2);
		},

		p: function update(changed, ctx) {
			if ((changed.channel) && t2_value !== (t2_value = ctx.channel.startsWith('#') ? ctx.channel.slice(1) : ctx.channel)) {
				set_data(t2, t2_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (25:4) {#if contentWarning.length > 0}
function create_if_block_4(ctx) {
	var p, b, t1, t2;

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "Content Warning:";
			t1 = space();
			t2 = text(ctx.contentWarning);
			add_location(b, file, 26, 8, 533);
			add_location(p, file, 25, 6, 520);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t1);
			append(p, t2);
		},

		p: function update(changed, ctx) {
			if (changed.contentWarning) {
				set_data(t2, ctx.contentWarning);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (31:4) {#if title}
function create_if_block_3(ctx) {
	var p, b, t1, t2;

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "title:";
			t1 = space();
			t2 = text(ctx.title);
			add_location(b, file, 32, 8, 643);
			add_location(p, file, 31, 6, 630);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t1);
			append(p, t2);
		},

		p: function update(changed, ctx) {
			if (changed.title) {
				set_data(t2, ctx.title);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (37:4) {#if summary}
function create_if_block_2(ctx) {
	var p, b, t_1, html_tag, raw_value = ssb.markdown(ctx.summary);

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "Summary:";
			t_1 = space();
			add_location(b, file, 38, 8, 736);
			html_tag = new HtmlTag(raw_value, null);
			add_location(p, file, 37, 6, 723);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t_1);
			html_tag.m(p);
		},

		p: function update(changed, ctx) {
			if ((changed.summary) && raw_value !== (raw_value = ssb.markdown(ctx.summary))) {
				html_tag.p(raw_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (43:4) {#if thumbnail}
function create_if_block_1(ctx) {
	var p, b, t_1, img, img_src_value;

	return {
		c: function create() {
			p = element("p");
			b = element("b");
			b.textContent = "Thumbnail:";
			t_1 = space();
			img = element("img");
			add_location(b, file, 44, 8, 855);
			attr(img, "class", "thumbnail-preview svelte-v1gwe5");
			attr(img, "src", img_src_value = "http://localhost:8989/blobs/get/" + ctx.thumbnail);
			attr(img, "alt", "post thumbnail");
			add_location(img, file, 45, 8, 882);
			add_location(p, file, 43, 6, 842);
		},

		m: function mount(target, anchor) {
			insert(target, p, anchor);
			append(p, b);
			append(p, t_1);
			append(p, img);
		},

		p: function update(changed, ctx) {
			if ((changed.thumbnail) && img_src_value !== (img_src_value = "http://localhost:8989/blobs/get/" + ctx.thumbnail)) {
				attr(img, "src", img_src_value);
			}
		},

		d: function destroy(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

function create_fragment(ctx) {
	var h2, t1, t2, html_tag, raw_value = ssb.markdown(ctx.content);

	var if_block = (ctx.channel || ctx.contentWarning.length > 0 || ctx.title || ctx.thumbnail) && create_if_block(ctx);

	return {
		c: function create() {
			h2 = element("h2");
			h2.textContent = "Post preview";
			t1 = space();
			if (if_block) if_block.c();
			t2 = space();
			add_location(h2, file, 15, 0, 230);
			html_tag = new HtmlTag(raw_value, null);
		},

		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},

		m: function mount(target, anchor) {
			insert(target, h2, anchor);
			insert(target, t1, anchor);
			if (if_block) if_block.m(target, anchor);
			insert(target, t2, anchor);
			html_tag.m(target, anchor);
		},

		p: function update(changed, ctx) {
			if (ctx.channel || ctx.contentWarning.length > 0 || ctx.title || ctx.thumbnail) {
				if (if_block) {
					if_block.p(changed, ctx);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					if_block.m(t2.parentNode, t2);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}

			if ((changed.content) && raw_value !== (raw_value = ssb.markdown(ctx.content))) {
				html_tag.p(raw_value);
			}
		},

		i: noop,
		o: noop,

		d: function destroy(detaching) {
			if (detaching) {
				detach(h2);
				detach(t1);
			}

			if (if_block) if_block.d(detaching);

			if (detaching) {
				detach(t2);
				html_tag.d();
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { channel, title, contentWarning, content, summary, thumbnail } = $$props;

	const writable_props = ['channel', 'title', 'contentWarning', 'content', 'summary', 'thumbnail'];
	Object.keys($$props).forEach(key => {
		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Preview> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ('channel' in $$props) $$invalidate('channel', channel = $$props.channel);
		if ('title' in $$props) $$invalidate('title', title = $$props.title);
		if ('contentWarning' in $$props) $$invalidate('contentWarning', contentWarning = $$props.contentWarning);
		if ('content' in $$props) $$invalidate('content', content = $$props.content);
		if ('summary' in $$props) $$invalidate('summary', summary = $$props.summary);
		if ('thumbnail' in $$props) $$invalidate('thumbnail', thumbnail = $$props.thumbnail);
	};

	return {
		channel,
		title,
		contentWarning,
		content,
		summary,
		thumbnail
	};
}

class Preview extends SvelteComponentDev {
	constructor(options) {
		super(options);
		if (!document.getElementById("svelte-v1gwe5-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, ["channel", "title", "contentWarning", "content", "summary", "thumbnail"]);

		const { ctx } = this.$$;
		const props = options.props || {};
		if (ctx.channel === undefined && !('channel' in props)) {
			console.warn("<Preview> was created without expected prop 'channel'");
		}
		if (ctx.title === undefined && !('title' in props)) {
			console.warn("<Preview> was created without expected prop 'title'");
		}
		if (ctx.contentWarning === undefined && !('contentWarning' in props)) {
			console.warn("<Preview> was created without expected prop 'contentWarning'");
		}
		if (ctx.content === undefined && !('content' in props)) {
			console.warn("<Preview> was created without expected prop 'content'");
		}
		if (ctx.summary === undefined && !('summary' in props)) {
			console.warn("<Preview> was created without expected prop 'summary'");
		}
		if (ctx.thumbnail === undefined && !('thumbnail' in props)) {
			console.warn("<Preview> was created without expected prop 'thumbnail'");
		}
	}

	get channel() {
		throw new Error("<Preview>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set channel(value) {
		throw new Error("<Preview>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get title() {
		throw new Error("<Preview>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set title(value) {
		throw new Error("<Preview>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get contentWarning() {
		throw new Error("<Preview>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set contentWarning(value) {
		throw new Error("<Preview>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get content() {
		throw new Error("<Preview>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set content(value) {
		throw new Error("<Preview>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get summary() {
		throw new Error("<Preview>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set summary(value) {
		throw new Error("<Preview>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get thumbnail() {
		throw new Error("<Preview>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set thumbnail(value) {
		throw new Error("<Preview>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

module.exports = Preview;

},{"svelte/internal":8}]},{},[15])