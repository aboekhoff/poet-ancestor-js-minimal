var RT = {

    'vegas::Symbol'  : Symbol,
    'vegas::Keyword' : Keyword,
    'vegas::Tag'     : Tag,

    'vegas::+' : function(x, y) {
	switch(arguments.length) {
	case 0: return 0
	case 1: return x
	case 2: return x + y
	default:
	    var r = x + y
	    var i = 2;
	    while (i<arguments.length) { r += arguments[i++] }
	    return r
	}
    },

    'vegas::*' : function(x, y) {
	switch(arguments.length) {
	case 0: return 1
	case 1: return x
	case 2: return x * y
	default:
	    var r = x * y
	    var i = 2;
	    while (i<arguments.length) { r *= arguments[i++] }
	    return r
	}
    },

    'vegas::-' : function(x, y) {
	switch(arguments.length) {
	case 0: throw Error('vegas::- requires at least one argument')
	case 1: return -x
	case 2: return x - y
	default:
	    var r = x - y
	    var i = 2;
	    while (i<arguments.length) { r -= arguments[i++] }
	    return r
	}
    },

    'vegas::/' : function(x, y) {
	switch(arguments.length) {
	case 0: throw Error('vegas::/ requires at least one argument')
	case 1: return 1/x
	case 2: return x / y
	default:
	    var r = x/y
	    var i = 2;
	    while (i<arguments.length) { r /= arguments[i++] }
	    return r
	}
    },

    'vegas::mod' : function(x, y) {
	return x % y
    },

    'vegas::div' : function(x, y) {
	return Math.floor(x/y)
    },

    'vegas::array?' : Array.isArray,

    'vegas::boolean?' : function(x) {
	return typeof x == 'boolean'
    },

    'vegas::number?' : function(x) {
	return typeof x == 'number'
    },

    'vegas::string?' : function(x) {
	return typeof x == 'string'
    },

    'vegas::array' : function() {
	var len = arguments.length
	var arr = new Array(len)
	for (var i=0; i<len; i++) { arr[i] = arguments[i] }
	return arr
    },

    'vegas::array*' : function() {
	var alen = arguments.length
	var b    = arguments[alen-1]
	var blen = b.length
	var arr = new Array(alen+blen-1)
	for (var i=0; i<alen-1; i++) { arr[i]   = arguments[i] }	
	for (var j=0; j<blen; j++)   { arr[i+j] = b[j] }
	return arr
    }


}
