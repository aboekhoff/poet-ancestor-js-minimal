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
	    while (i<arguments.length) { r += arguments[i] }
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
	    while (i<arguments.length) { r *= arguments[i] }
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
	    while (i<arguments.length) { r -= arguments[i] }
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
	    while (i<arguments.length) { r /= arguments[i] }
	    return r
	}
    },

    'vegas::mod' : function(x, y) {
	return x % y
    },

    'vegas::div' : function(x, y) {
	return Math.floor(x/y)
    }

}
