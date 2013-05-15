// BEGIN vegas.core.js

// may remove log at a later date

function log(string) {
}

// for now it's invaluable while ironing bugs
// out of the compiler

var Runtime = {}

function Keyword(name) {
    if (name in Keyword.interns) {
	return Keyword.interns[name]
    } else if (this instanceof Keyword) {
	this.name = name;
	Keyword.interns[name] = this;
    } else {
	return new Keyword(name)
    }
}

Keyword.interns = {}

Keyword.prototype.toString = function() {
    return this.name
}

function Symbol(namespace, name) {
    if (!(this instanceof Symbol)) {
	return new Symbol(namespace, name)
    }
    this.namespace = namespace;
    this.name      = name;
    this.key       = "#" + name;
}

Symbol.prototype.toString = function() {
    return this.name
}

Symbol.coreSymbol = function(name) {
    return new Symbol("vegas", name)
}

Symbol.prototype.applyTag = function(tag) {
    return this.namespace ?
	this :
	new TaggedSymbol(this, tag)
}

Symbol.prototype.reify = function() {
    return new Symbol(null, this.name)
}

function TaggedSymbol(symbol, tag) {
    this.name   = symbol.name
    this.key    = tag + symbol.key
    this.tag    = tag
}

TaggedSymbol.prototype = new Symbol(null, null)

TaggedSymbol.prototype.applyTag = function(tag) {
    return tag == this.tag ?
	this.symbol :
	new TaggedSymbol(this, tag)
}

TaggedSymbol.prototype.reify = function() {
    return new Symbol(null, this.key)
}

/*
  Tag objects are simply an Env object and a unique id.
*/

function Tag(env) {
    if (!(this instanceof Tag)) {
	return new Tag(env)
    }
    this.id  = ++Tag.nextID
    this.env = env
}

Tag.nextID = 0;

Tag.prototype.toString = function() {
    return '%' + this.id
}

Tag.prototype.sanitize = function(sexp) {
    if (sexp instanceof Symbol) {
	return sexp.applyTag(this)
    } 

    else if (sexp instanceof Array) {
	return sexp.map(this.sanitize.bind(this))
    }

    else {
	return sexp
    }
}

/* 
   extensible dictionaries
*/

function Dict(bindings, parent) {
    this.bindings = bindings
    this.parent   = parent
}

Dict.create = function() {
    return new Dict({}, null)
}

Dict.prototype.extend = function() {
    return new Dict({}, this)
}

Dict.prototype.get = function(key, notFound) {
    var dict = this;
    while (dict) {
	if (key in dict.bindings) {
	    return dict.bindings[key]
	} else {
	    dict = dict.parent
	}
    }
    return notFound
}

Dict.prototype.put = function(key, val) {
    this.bindings[key] = val    
    return this
}

/* 
   Env objects are wrappers around dictionaries
   with special support for resolving symbols that have
   been tagged during macroexpansion.
*/

function Env(dict) {
    this.dict = dict
}

Env.registry = {}
Env.exports  = {}

Env.addExport = function(namespace, symbol) {
    var list = Env.exports[namespace] || (Env.exports[namespace] = [])
    list.push(symbol)
}

Env.getExports = function(namespace) {
    return Env.exports[namespace]
}

// for now we won't worry about loading modules
// since anything predefined will not require IO

Env.find = function(name) {
    if (name in Env.registry) {
	return Env.registry[name]
    } else {
	return Env.load(name)
    }    
}

Env.load = function(name) {
    throw Error('Env.load not implemented')
}

Env.createEmpty = function() {
    return new Env(Dict.create())
}

Env.findOrCreate = function(name, empty) {
    return Env.registry[name] || Env.create(name, empty)
}

Env.create = function(name, notEvenRequire) {
    var env = new Env(Dict.create())
    if (!notEvenRequire) { env.put(new Symbol(null, 'require'), 'require') }	
    Env.registry[name] = env
    return env
}

Env.toKey = function(obj) {

    if (obj == null) {
	return "null"
    } 

    if (obj instanceof Symbol) {
	return obj.key
    }

    if (obj instanceof Array) {
	return "[[" + obj.map(Env.toKey).join("][") + "]]"
    }

    else {
	return obj.constructor.name + "#" + obj
    }

}

Env.prototype.extend = function() {
    return new Env(this.dict.extend())
}

Env.prototype._get = function(key, notFound) {
    return this.dict.get(key, notFound)
}

Env.prototype._put = function(key, val) {
    this.dict.put(key, val)
    return this
}

Env.prototype.get = function(obj, notFound) {
    if (obj instanceof Symbol) {
	if (obj.namespace) {
	    return Env.find(obj.namespace)._get(obj.key)
	}

	var env = this
	for(;;) {
	    var tmp = env._get(obj.key)
	    if (tmp) { 
		return tmp 
	    } else if (obj instanceof TaggedSymbol) {
		env = obj.tag.env
		obj = obj.symbol
	    } else {
		return notFound
	    }
	}
    }

    else {
	return this._get(Env.toKey(obj), notFound)
    }

}

Env.prototype.put = function(obj, val) {
    return this._put(Env.toKey(obj), val)
}


// END vegas.core.js

// BEGIN vegas.expander.js

/* 
   Expander objects handle the initial AST transformation process that
   is customized by user macros.   
   The output of the expander is an AST in which all top-level symbols
   have been qualified, and all tagged symbols have been reified.   
*/

function Expander(namespace, symbols, labels) {
    this.namespace = namespace;
    this.symbols   = symbols;
    this.labels    = labels;
} 

Expander.prototype.extendSymbols = function() {
    return new Expander(this.namespace, this.symbols.extend(), this.labels)
}

Expander.prototype.extendLabels = function() {
    return new Expander(this.namespace, this.symbols, this.labels.extend())
}

Expander.prototype.maybeResolveToMacro = function(sexp) {
    if (sexp instanceof Array && sexp[0] instanceof Symbol) {
	var denotation = this.symbols.get(sexp[0])	
	if (typeof denotation == 'function') {
	    return denotation
	} 	    	
    }
    return null
}

Expander.prototype.maybeResolveToSpecialForm = function(sexp) {
    if (sexp instanceof Array && sexp[0] instanceof Symbol) {
	var denotation = this.symbols.get(sexp[0])	
	if (typeof denotation == 'string') {
	    return denotation
	} 	    	
    }
    return null
}

Expander.prototype.maybeResolveToDo = function(sexp) {
    return this.maybeResolveToSpecialForm(sexp) == 'do'
}

Expander.prototype.maybeResolveToDefine = function(sexp) {
    return this.maybeResolveToSpecialForm(sexp) == 'define*'
}

Expander.prototype.maybeResolveToDefineMacro = function(sexp) {    
    return this.maybeResolveToSpecialForm(sexp) == 'define-macro*'
}

Expander.prototype.macroexpand1 = function(sexp) {
    var macro = this.maybeResolveToMacro(sexp)
    if (macro) {
	log('\n[MACROEXPAND1]\n')
	log(prnstr(sexp))
	var sexp = macro(sexp, this)
	log(prnstr(sexp))
	return sexp
    } else {
	return sexp
    }
}

Expander.prototype.macroexpand = function(sexp) {
    var _sexp = this.macroexpand1(sexp)
    return sexp === _sexp ? _sexp : this.macroexpand(_sexp)
}

Expander.prototype.expandSexps = function(sexps) {
    return sexps.map(this.expandSexp.bind(this))
}

Expander.prototype.expandSexp = function(sexp) {
    sexp = this.macroexpand(sexp)

    if (sexp instanceof Symbol) {
	return this.expandSymbol(sexp)
    }

    if (sexp instanceof Array) {
	return this.expandArray(sexp)
    }

    else {
	return sexp
    }

}

Expander.prototype.expandSymbol = function(symbol) {    
    var denotation = this.symbols.get(symbol)

    if (denotation instanceof Symbol) {
	return denotation
    }

    if (denotation == null) {
	return this.bindGlobal(symbol)
    }

    else {
	this.raise('cannot take value of special-form/macro', symbol)
    }

}

Expander.prototype.bindLabel = function(label) {
    var denotation = label instanceof Symbol ? label.reify() : label
    this.labels.put(label, denotation)
    return denotation
}

Expander.prototype.bindGlobal = function(symbol) {
    var namespace       = symbol.namespace || this.namespace
    var symbols         = Env.find(namespace)
    var reifiedSymbol   = symbol.reify()
    var qualifiedSymbol = new Symbol(namespace, reifiedSymbol.name)

    symbols.put(symbol, qualifiedSymbol)
    symbols.put(reifiedSymbol, qualifiedSymbol)
    Env.addExport(namespace, reifiedSymbol)
    return qualifiedSymbol
}

Expander.prototype.bindLocal = function(symbol) {
    var reifiedSymbol = symbol.reify()
    this.symbols.put(symbol, reifiedSymbol)
    return reifiedSymbol
}

Expander.prototype.expandArray = function(sexp) {
    var sf = this.maybeResolveToSpecialForm(sexp)
    return sf ? 
	this.expandSpecialForm(sf, sexp) : 
	this.expandCall(sexp[0], sexp.slice(1))
}

Expander.prototype.expandCall = function(callee, args) {
    var callee = this.macroexpand(callee)
    if (callee instanceof Symbol &&
        !callee.namespace &&
	/\.[^\.]+/.test(callee.name)) {
	var method = callee.name.substring(1)
	var target = this.expandSexp(args[0])
	var _args  = this.expandSexps(args.slice(1))
	return [[Symbol.coreSymbol('.'), target, method]].concat(_args)
    } else {	
	return [this.expandSexp(callee)].concat(this.expandSexps(args)) 
    }
}

Expander.prototype.expandBody = function(body) {
    var input  = body.slice()
    var output = []

    while (input.length > 0) {
	var sexp = input.shift()
	if (this.maybeResolveToDo(sexp)) {
	    input = sexp.slice(1).concat(input)
	} else {
	    output.push(this.expandSexp(sexp))
	}	    
    }
	 
    switch (output.length) {
    case 0:  return null
    case 1:  return output[0]
    default: return [Symbol.coreSymbol('do'), output]
    }

}

Expander.prototype.expandFn = function(args, body) {
    var exp   = this.extendSymbols()
    var _args = []
    for (var i=0; i<args.length; i++) {
	var arg = args[i]
	if (arg instanceof Symbol) {
	    _args[i] = exp.bindLocal(args[i]) 
	} else if (arg instanceof Keyword) {
	    _args[i] = arg
	} else {
	    throw Error('invalid object in arglist: ' + arg)
	}
    }
    var _body = exp.expandBody(body)
    return [Symbol.coreSymbol('fn*'), 
	    _args, 
	    _body]
}

Expander.prototype.expandLet = function(bindings, body) {
    var _bindings = []
    var exp       = this

    for (var i=0; i<bindings.length; i++) {
	var exp   = exp.extendSymbols()
	var expr  = exp.expandSexp(bindings[i][1])
	var local = exp.bindLocal(bindings[i][0])
	_bindings.push([local, expr])
    }

    var _body = exp.expandBody(body)

    return [Symbol.coreSymbol('let'), 
	    _bindings, 
	    _body]

}

Expander.prototype.expandLetrec = function(bindings, body) {
    var _bindings = []
    var exp       = this.extendSymbols()

    for (var i=0; i<bindings.length; i++) {
	var sym = exp.bindLocal(bindings[i][0])
	_bindings.push([sym, null])
    }

    for (var i=0; i<bindings.length; i++) {
	_bindings[i][1] = exp.expandSexp(bindings[i][1])
    }

    var _body = exp.expandBody(body)
    
    return [Symbol.coreSymbol('letrec'), 
	    _bindings, 
	    _body]

}

Expander.prototype.expandLabel = function(label) {
    if (this.labels.get(label)) {
	return label
    } else {
	throw Error('label: ' + label + ' is not in scope')
   }
}

Expander.prototype.expandUnwindProtect = function(clauses) {
    // FIXME
}

Expander.prototype.expandQuasiquote = function() {
    
}

Expander.prototype.expandSpecialForm = function(name, sexp) {
    switch(name) {

    case 'quote':
	return [Symbol.coreSymbol('quote'), sexp[1]]

    case 'quasiquote':
	return this.expandQuasiquote(sexp[1])

    case 'unquote':
	throw Error('unquote outside of quasiquote')

    case 'unquote-splicing':
	throw Error('unquote-splicing outside of quasiquote')

    case 'define*':
	throw Error('define* in expression context')

    case 'define-macro*':
	throw Error('define-macro* outside of toplevel')

    case 'fn*':         
	return this.expandFn(sexp[1], sexp.slice(2))

    case 'do':
	return this.expandBody(sexp.slice(1))

    case '.':
	var prefix = [Symbol.coreSymbol('.'), this.expandSexp(sexp[1])]
	var suffix = this.expandSexps(sexp.slice(2))
	return prefix.concat(suffix)

    case 'if':
	return [Symbol.coreSymbol('if'),
		this.expandSexp(sexp[1]),
		this.expandSexp(sexp[2]),
		this.expandSexp(sexp[3])]

    case 'let':        	
	return this.expandLet(sexp[1], sexp.slice(2))

    case 'letrec':     
	return this.expandLetrec(sexp[1], sexp.slice(2))

    case 'unwind-protect':
	return this.expandUnwindProtect(sexp.slice(1))

    case 'set':        
	return [Symbol.coreSymbol('set'), 
		this.expandSexp(sexp[1]),
	        this.expandSexp(sexp[2])]

    case 'block':
	var exp   = this.extendLabels()
	var label = exp.bindLabel(sexp[1])
	var body  = exp.expandBody(sexp.slice(2))
	return [Symbol.coreSymbol('block'), label, body]
	
    case 'loop':
	var exp = this.extendLabels()
	exp.bindLabel(null)
	return [Symbol.coreSymbol('loop'), 
	        exp.expandBody(sexp.slice(1))]

    case 'return-from':
	return [Symbol.coreSymbol('return-from'),		
		this.expandLabel(sexp[1]),
		this.expandSexp(sexp[2])]

    case 'throw':
	return [Symbol.coreSymbol('throw'), 
		this.expandSexp(sexp[1])]

    case 'js*': 
	return [Symbol.coreSymbol('js*'), sexp[1]]

    case 'require':
	var options   = {}
	var namespace = '' + sexp[1]

	for (var i=2; i<sexp.length; i+=2) {
	    options[sexp[i]] = sexp[i+1]
	}

	options.prefix  = options.prefix || ""

	if (options.only) {
	    var names = {}
	    options.only.forEach(function(x) {names[x] = true })
	    var accept = function(sym) {
		return !!names[sym]
	    }
	}

	else if (options.exclude) {	    
	    var names = {}
	    options.except.forEach(function(x) {name[x] = true})
	    var accept = function(sym) {
		return !names[sym]
	    }
	}

	else {
	    var accept = function(x) { return true }
	}

	var env     = Env.find(namespace)
	var exports = Env.getExports(namespace)

	for (var i=0; i<exports.length; i++) {	    
	    var symbol = exports[i]
	    if (accept(symbol)) {
		var denotation = env.get(symbol)
		var alias      = new Symbol(null, options.prefix + symbol)
		this.symbols.put(alias, denotation)
	    }	    
	}

	return namespace + " required"

    }

}

Expander.prototype.createTopLevel = function() {
    return new Expander.TopLevel(this, [])
}

// the responsibility of evaluating code (for macros)
// lies outside the domain of the expander
// thus it exposes a top level interface which yields
// a sequence of [EXPRESSION] or [DEFMACRO] forms
// 
// toplevel definitions are exported and then changed to
// set forms

Expander.TopLevel = function(expander, sexps) {
    this.expander = expander
    this.sexps    = sexps
}

Expander.TopLevel.prototype = {
    push: function() {
	this.sexps.push.apply(this.sexps, arguments)
    },

    isEmpty: function() {
	return this.sexps.length == 0
    },

    expandNext: function() {
	loop:for(;;) {
	    var sexp = this.expander.macroexpand(this.sexps.shift())
	    show(sexp)

	    if (this.expander.maybeResolveToDo(sexp)) {
		this.sexps = sexp.slice(1).concat(this.sexps)
		continue loop
	    }

	    if (this.expander.maybeResolveToDefineMacro(sexp)) {
		return ['DEFINE_MACRO', sexp[1], this.expander.expandSexp(sexp[2])]
	    }

	    if (this.expander.maybeResolveToDefine(sexp)) {
		var qsym = this.expander.bindGlobal(sexp[1])
		var sym  = new Symbol(null, qsym.name)
		Env.addExport(qsym.namespace, sym)
		return ['EXPRESSION', 
			[Symbol.coreSymbol('set'),
			 qsym, 
			 this.expander.expandSexp(sexp[2])]]
	    }

	    else {
		var res = this.expander.expandSexp(sexp)
		show(res)
		return ['EXPRESSION', res]
	    }

	}
    }

}

// END vegas.expander.js

// BEGIN vegas.reader.js

// FIXME (add back support for qualified symbols and keywords)

function Position(offset, line, column, origin) {
    this.offset = offset;
    this.line   = line;
    this.column = column;
    this.origin = origin;
}

Position.prototype.toString = function() {
    return "line "   + this.line   + ", " +
	"column " + this.column + ", " +
	"at "     + (this.origin || "unknown location");
};

function Reader() {	
    this.input  = null;
    this.offset = 0;
    this.line   = 1;
    this.column = 1;
    this.origin = "unknown";
}

Reader.create = function(input, origin) {
    var reader   = new Reader();
    if (input)  { reader.input  = input }
    if (origin) { reader.origin = origin }
    return reader;
}

Reader.hexRegex    = /0(x|X)[0-9a-fA-F]+/;
Reader.octRegex    = /0[0-7]+/;
Reader.intRegex    = /[0-9]+/;
Reader.floatRegex  = /[0-9]+\.[0-9]+/;
Reader.binaryRegex = /0(b|B)[01]+/;

Reader.escapeMap = {
    'n'  : '\n',
    'r'  : '\r',
    'f'  : '\f',
    'b'  : '\b',
    't'  : '\t',
    '"'  : '"',
    '\\' : '\\'
};

Reader.notTerminal = function(c) {
    switch (c) {
    case ' ':
    case '\t':
    case '\n':
    case '\r':
    case '\f':
    case ';':
    case '(':
    case ')':
    case '"':
    case "'":
    case '`':
	return false;
    default:
	return true;
    }
};

Reader.prototype = {
    constructor: Reader,

    makeList: function(list, position) {
	list['source-position'] = position
	return list
    },

    reset: function(input, origin) {
	this.input  = input;
	this.origin = origin;
	this.offset = 0;
	this.line   = 1;
	this.column = 1;
    },

    loadPosition: function(position) {
	this.offset = position.offset;
	this.line   = position.line;
	this.column = position.column;
	this.origin = position.origin;		
    },

    getPosition: function() {
	return new Position(
	    this.offset,
	    this.line,
	    this.column,
	    this.origin
	);
    },

    isEmpty: function() {
	this.readWhitespace();
	return this.offset >= this.input.length;
    },

    peek: function() {
	return this.input[this.offset];
    },

    pop: function() {
	var c = this.peek();
	this.offset++;
	return c;
    },

    popWhile: function(pred) {
	var s = [];
	for(;;) {
	    var c = this.peek();
	    if (c == null || !pred(c)) { break; }
	    s.push(this.pop());
	}
	return s.join("");
    },

    readWhitespace: function() {
	var inComment = false;
	loop:for(;;) {
	    var c = this.peek();
	    if (c == null) { return; }

	    switch(c) {
	    case ';' : 
		inComment = true; 
		this.pop(); 
		continue loop;

	    case '\n': 
	    case '\r':
	    case '\f': 
		inComment = false;

	    case ' ' :
	    case '\t':
		this.pop();
		continue loop;

	    default:
		if (inComment) { 
		    this.pop(); 
		} else {
		    return;
		}
		
	    }
	}
    },

    readSexp: function() {
	this.readWhitespace();
	var nextChar = this.peek();

	switch (nextChar) {
	case ')': this.syntaxError('unmatched closing paren');
	case '(': return this.readList();
	case '"': return this.readString();
	case "'": return this.readQuote();
	case ',': return this.readUnquote();
	case '`': return this.readQuasiquote();
	default:  return this.readAtom();
	}
    },

    readQuote: function() {
	var position = this.getPosition();
	this.pop();
	return this.makeList(
	    [Symbol.coreSymbol('quote', position),
	     this.readSexp()], 
	    position);
    },

    readQuasiquote: function() {
	var position = this.getPosition();
	this.pop();
	return this.makeList(
	    [Symbol.coreSymbol('quasiquote'),
	     this.readSexp()],
	    position);		
    },

    readUnquote: function() {
	var position = this.getPosition();
	var name     = 'unquote';
	this.pop();

	if (this.peek() == '@') {
	    this.pop();
	    name = 'unquote-splicing';
	}				

	return this.makeList(
	    [Symbol.coreSymbol(name), this.readSexp()]
	)

    },

    readList: function() {
	var position = this.getPosition();		
	var list     = [];
	this.pop();

	loop:for(;;) {			
	    this.readWhitespace();
	    var c = this.peek();
	    switch(c) {
	    case null : this.error('unclosed list', position);
	    case ')'  : this.pop(); return this.makeList(list, position);
	    default   : list.push(this.readSexp()); continue loop;
	    }
	}
    },

    readString: function() {
	var position = this.getPosition();
	var string   = [];
	this.pop();
	loop:for(;;) {
	    var c = this.pop();
	    switch(c) {
	    case null: this.error('unclosed string literal', position);
	    case '"' : return string.join("");
	    case '\\':
		var position2 = this.getPosition();
		var cc = this.escapeMap[this.pop()];
		if (!cc) { this.error('invalid escape character', position2); }
		this.string.push(cc);
		continue;
	    default:
		string.push(c);
		continue;
	    }
	}
    },

    parseNumber: function(string, position) {
	var sign = 1;
	if (string[0] == '-') {
	    sign   = -1;
	    string = string.substring(1);
	}

	switch (true) {
	case Reader.floatRegex.test(string)  : return sign * parseFloat(string);
	case Reader.hexRegex.test(string)    : return sign * parseInt(string, 16);
	case Reader.octRegex.test(string)    : return sign * parseInt(string, 8);
	case Reader.binaryRegex.test(string) : return sign * parseInt(string, 2);
	case Reader.intRegex.test(string)    : return sign * parseInt(string, 10);
	default:
	    throw Error('invalid number literal at ' + position);
	}
    },

    parseSymbol: function(string, position) {
	if (string[0] == ":") {
	    return Keyword(string.substring(1))
	}

	else {
	    return new Symbol(null, string)
	}
	
    },

    readAtom: function() {
	var position = this.getPosition();
	var string   = this.popWhile(Reader.notTerminal);

	switch (string) {
	case '#t'    : return true;
	case '#f'    : return false;
	case '#nil'  : return null;
	case '#void' : return undefined;
	}

	if (/\d|(-\d)/.test(string[0])) {
	    return this.parseNumber(string, position);
	} else {
	    return this.parseSymbol(string, position);
	}

    }    

};


// END vegas.reader.js

// BEGIN vegas.compiler.js

// first pass normalizes the tree to make further processing more convenient

function normalizeBindings(bindings) {
    return bindings.map(normalizeArray)
}

function normalizeArray(array) {
    return array.map(normalize)
}

function normalizeLabel(obj) {
    return ['LABEL', Env.toKey(obj)]
}

function normalizeFn(args, body) {
    body = normalize(body)

    var pargs = []
    var rest  = null
    var self  = null

    var i=0;
    while(i<args.length) {
	var arg = args[i++]

	if (arg instanceof Symbol) {
	    pargs.push(normalize(arg))
	} 

	if (arg instanceof Keyword) {
	    var key = arg
	    var arg = normalize(args[i++])
	    switch (key.name) {
	    case 'rest':
		rest = arg
		break
	    case 'this':
		self = arg
		break
	    }
	}
    }        

    if (rest || self) {
	body = [body]
	if (rest) { body.unshift(['RESTARGS', rest, pargs.length]) }
	if (self) { body.unshift(['THIS', self]) }
	body = ['DO', body]
    }

    console.log(pargs)
    console.log(body)

    return ['FUN', pargs, body]

}

var NULL_LABEL = normalizeLabel(null)

function normalize(sexp) {
    if (sexp instanceof Symbol) {
	return sexp.namespace ? 
	    ['GLOBAL', sexp.namespace, sexp.name] :
	    ['LOCAL', sexp.name]
    } 

    if (!(sexp instanceof Array)) {
	return ['CONST', sexp]
    }

    if (sexp[0] instanceof Symbol &&
        sexp[0].namespace == 'vegas') {
	switch(sexp[0].name) {

	case '.':
	    var node = normalize(sexp[1])
	    for (var i=2; i<sexp.length; i++) {
		node = ['PROPERTY', node, normalize(sexp[i])]
	    }
	    return node

	case 'fn*': 
	    console.log(sexp)
	    return normalizeFn(sexp[1], sexp[2])

	case 'do' : 
	    return ['DO', normalizeArray(sexp[1])]

	case 'if' : 
	    return ['IF', 
		    normalize(sexp[1]), 
		    normalize(sexp[2]),
		    normalize(sexp[3])]

	case 'let' :
	    return ['LET',
		    normalizeBindings(sexp[1]),
		    normalize(sexp[2])]

	case 'letrec' :
	    return ['LETREC',
		    normalizeBindings(sexp[1]),
		    normalize(sexp[2])]

	case 'unwind-protect' :
	    return normalizeUnwindProtect(sexp)
	
	case 'set' :
	    return ['SET', normalize(sexp[1]), normalize(sexp[2])]

	case 'loop' : 
	    return ['LOOP', normalize(sexp[1])]

	case 'block' : 
	    return ['BLOCK', 
		    normalizeLabel(sexp[1]), 
		    normalize(sexp[2])]
	    
	case 'return-from':
	    return ['RETURN_FROM', 
		    normalizeLabel(sexp[1]), 
		    normalize(sexp[2])]

	case 'throw':
	    return ['THROW', normalize(sexp[1])]

	case 'js*':
	    return ['RAW', sexp[1]]

	}   
    }

    return ['CALL', normalize(sexp[0]), normalizeArray(sexp.slice(1))]

}

//

function tracerFor(node) {    
    function tracer(val) {
	tracer.traced = true
	return ['SET', node, val]
    }
    tracer.traced = false
    return tracer
}

function Scope(level, locals, labels) {
    this.level  = level
    this.locals = locals
    this.labels = labels
}

Scope.create = function() {
    return new Scope(0, 0, 0) 
}

Scope.prototype = {
    extend: function() {
	return new Scope(this.level+1, 0, 0)
    },

    makeLocal: function() {
	return ['LOCAL', this.level, this.locals++]
    },

    makeLabel: function(tracer) {
	return ['LABEL', this.level, this.labels++, false, tracer]
    }

}

function Context(block, env, scope) {
    this.block = block
    this.env   = env
    this.scope = scope
}

Context.create = function() {
    return new Context([], Dict.create(), Scope.create())
}

Context.compile = function(prog, wantRtn) {
    var ctx = Context.create()

    if (wantRtn) {
	var rtn = ctx.scope.makeLocal()
	ctx.compile(prog, tracerFor(rtn))
	ctx.declareLocals()
	ctx.push(['RETURN', rtn])
    } 

    else {
	ctx.compile(prog, null)
	ctx.declareLocals()
    }

    return ctx.block

}

Context.prototype = {

    extendEnv: function() {
	return new Context(
	    this.block, 
	    this.env.extend(), 
	    this.scope
	)
    },

    extendScope: function() {
	return new Context(
	    [],
	    this.env.extend(),
	    this.scope.extend()
	)
    },

    declareLocals: function() {
	if (this.scope.locals > 0) {
	    this.block.unshift(['DECLARE', this.scope.level, this.scope.locals]) 
	}
    },

    withBlock: function() {
	return new Context([], this.env, this.scope)
    },

    bindLabel: function(node, tracer) {
	var label = this.scope.makeLabel(tracer)
	this.env.put(node, label)
	return label
    },

    bindLocal: function(node) {
	var local = this.scope.makeLocal()
	this.env.put(node, local)
	return local
    },

    bindArgs: function(nodes) {
	var args = []
	for (var i=0; i<nodes.length; i++) {
	    var arg = ['ARG', this.scope.level, i]
	    this.env.put(nodes[i], arg)
	    args.push(arg)
	}
	return args
    },

    getLocal: function(node) {
	return this.env.get(node)
    },

    getLabel: function(node) {
	return this.env.get(node)
    },

    push: function(x) {
	this.block.push(x)
    },

    pushExpr: function(x, t) {
	this.block.push(t ? t(x) : x)
    },

    pushPure: function(x, t) {
	if (t) { this.block.push(t(x)) }
    },

    toAtom: function(node) {	
	var tag = node[0]
	switch(tag) {

	case 'CONST':
	    return node

	case 'VAR':
	    return this.getVar(node)

	default:
	    var atom = this.scope.makeLocal()
	    this.compile(node, tracerFor(atom))
	    return atom
	}
    },

    toExprs: function(nodes) {
	var exprs = []
	for (var i=0; i<nodes.length; i++) {
	    exprs[i] = this.toExpr(nodes[i])
	}
	return exprs
    },

    toExpr: function(node) {
	var tag = node[0]
	switch(tag) {

	case 'RESTARGS':
	case 'RAW':
	case 'CONST':
	case 'GLOBAL':	    
	    return node

	case 'PROPERTY':
	    return ['PROPERTY', this.toExpr(node[1]), this.toExpr(node[2])]

	case 'LOCAL':
	    return this.getLocal(node)

	case 'SET':
	    var loc = this.toExpr(node[1])
	    this.compile(node[2], tracerFor(loc))
	    return loc

	case 'FUN':
	    var cmp    = this.extendScope()
	    var ret    = cmp.scope.makeLocal()
	    var args   = cmp.bindArgs(node[1])
	    cmp.compile(node[2], tracerFor(ret))
	    cmp.declareLocals()
	    cmp.push(['RETURN', ret])
	    return ['FUN', args, cmp.block]

	case 'CALL':
	    var callee = this.toExpr(node[1])
	    var args   = this.toExprs(node[2])
	    return ['CALL', callee, args]

	case 'THIS':
	case 'RESTARGS':
	case 'THROW':
	case 'RETURN_FROM':
	    this.compile(node, null)
	    return ['CONST', null]

	case 'DO':
	    var body = node[1]
	    var len  = body.length
	    for (var i=0; i<len; i++) {
		if (i < len-1) {
		    this.compile(body[i], null)
		} else {
		    return this.toExpr(body[i])
		}
	    }

	default:
	    var local = this.scope.makeLocal()
	    this.compile(node, tracerFor(local))
	    return local
	    
	}
    },

    toBlock: function(node, tracer) {
	var cmp = this.withBlock()
	cmp.compile(node, tracer)
	return cmp.block
    },

    compileBody: function(body, tracer) {	
	var len = body.length
	for (var i=0; i<len; i++) {
	    if (i < len-1) {
		this.compile(body[i], null)
	    } else {
		this.compile(body[i], tracer)
	    }
	}
    },

    compile: function(node, tracer) {
	var tag = node[0]

	switch(tag) {

	case 'RAW':
	case 'CONST':
	case 'GLOBAL':
	    this.pushPure(node, tracer)
	    break

	case 'LOCAL':
	    this.pushPure(this.getLocal(node), tracer)
	    break

	case 'DO':
	    this.compileBody(node[1], tracer)
	    break

	case 'IF':
	    var test        = this.toAtom(node[1])
	    var consequent  = this.toBlock(node[2], tracer)
	    var alternative = this.toBlock(node[3], tracer)
	    this.push(['IF', test, consequent, alternative])
	    break

	case 'LOOP':
	    var cmp   = this.extendEnv()
	    var label = cmp.bindLabel(NULL_LABEL, tracer)
	    var block = cmp.toBlock(node[1], tracer)
	    this.push(['LOOP', label, block])	   
	    break

	case 'BLOCK':
	    var cmp   = this.extendEnv()
	    var label = cmp.bindLabel(node[1], tracer)
	    var block = cmp.toBlock(node[2], tracer)
	    this.push(['BLOCK', label, block])
	    break
	    
	case 'RETURN_FROM':
	    // label structure:
	    // [ TAG, LEVEL, ID, HAS_NON_LOCAL_EXITS?, TRACER, CONTEXT]
	    var label  = this.getLabel(node[1])
	    var tracer = label[4]
	    this.compile(node[2], tracer)
	    if (this.scope.level != label[1]) {	
		if (!label[3]) { label[3] = true }
		this.push(['NON_LOCAL_EXIT', label])
	    } else {
		this.push(['LOCAL_EXIT', label])
	    }
	    break

	case 'LET':
	    var ctx      = this
	    var bindings = node[1]
	    var body     = node[2]
	    for (var i=0; i<bindings.length; i++) {		
		var pair  = bindings[i]
		var sym   = pair[0]
		var expr  = pair[1]
		var local = ctx.scope.makeLocal()
		ctx.compile(expr, tracerFor(local))
		ctx = ctx.extendEnv()
		ctx.env.put(sym, local)
	    }
	    ctx.compile(body, tracer)
	    break

	case 'THROW':
	    this.push(['THROW', this.toExpr(node[1])])
	    break

	case 'PROPERTY':
	case 'SET':
	case 'FUN':
	    this.pushPure(this.toExpr(node), tracer)
	    break

	case 'CALL':
	    this.pushExpr(this.toExpr(node), tracer)
	    break

	case 'RESTARGS':
	    var local = this.bindLocal(node[1])
	    this.push(['RESTARGS', local, node[2]])
	    break

	case 'THIS':
	    var local = this.bindLocal(node[1])
	    this.push(['THIS', local])
	    break	    

	default:
	    throw Error('bad tag in compile: ' + node[0])
	}
    },

    compileTopLevelFragment: function(normalizedSexp) {
	this.compile(normalizedSexp)
	this.declareLocals()
	return this.block
    },

    compileExpression: function(normalizedSexp) {
	var ret = this.scope.makeLocal()
	this.compile(normalizedSexp, tracerFor(ret))
	this.declareLocals()
	this.push(['RETURN', ret])	
	return this.block
    }

}



// END vegas.compiler.js

// BEGIN vegas.emitter.js

function Emitter() {
    this.buffer    = []
    this.indention = 0
}

Emitter.emitProgram = function(program, options) {
    var e = new Emitter()
    if (options) { for (var v in options) { e[v] = options[v] } }
    e.emitStatements(program)
    return e.getResult()
}

Emitter.bake = function(program, options) {
    var e = new Emitter()
    if (options) { for (var v in options) { e[v] = options[v] } }
    e.emitStatements(program)
    var warhead = Function(e.globalSymbol, e.getResult())
    return warhead
}

Emitter.prototype = {
    indentSize:   4,

    globalSymbol: "RT",

    namespaceSeparator: "::",

    getResult: function() {
	return this.buffer.join("")
    },

    indent: function() {
	this.indention += this.indentSize
    },

    dedent: function() {
	this.indention -= this.indentSize
    },

    write: function(x) {
	this.buffer.push(x)
    },

    tab: function() {
	var i=this.indention
	while(i--) { this.write(" ") }
    },

    // carriage return
    cr: function() {
	this.write("\n")
	this.tab()
    },

    emitNodes: function(nodes, sep) {
	var started = false
	for (var i=0; i<nodes.length; i++) {
	    if (started) { this.write(sep) } else { started = true }
	    this.emit(nodes[i])
	}
    },

    emitArray: function(nodes) {
	this.write("[")
	this.emitNodes(nodes, ", ")
	this.write("]")
    },

    emitList: function(nodes) {
	this.write("(")
	this.emitNodes(nodes, ", ")
	this.write(")")
    },

    emitStatements: function(nodes) {
	for (var i=0; i<nodes.length; i++) {
	    this.cr()
	    this.emit(nodes[i]);
	    this.write(";")
	}
    },

    emitBlock: function(nodes) {
	this.write("{")
	this.indent()
	this.emitStatements(nodes)
	this.dedent()
	this.cr()
	this.write("}")
    },

    emitLabel: function(node) {
	this.write("block_")
	this.write(node[1])
	this.write("_")
	this.write(node[2])
    },

    emitFlag: function(node) {
	this.write("flag_")
	this.write(node[1])
	this.write("_")
	this.write(node[2])
    },

    emitLabeledBlock: function(prefix, label, block) {
	var hasNonLocalExits = label[3]	

	if (hasNonLocalExits) {	    
	    this.write('var ')
	    this.emitFlag(label)
	    this.write(' = true;')
	    this.cr()
	    this.write('try {')
	    this.indent()
	    this.cr()
	}

	this.emitLabel(label)
	this.write(":")
	this.write(prefix)
	this.write(" ")
	this.emitBlock(block)
	
	if (hasNonLocalExits) {
	    this.dedent()
	    this.cr()

	    this.write("} catch (e) {")
	    this.indent()
	    this.cr()

	    this.write('if (')
	    this.emitFlag(label)
	    this.write(') {')
	    this.indent()
	    this.cr()

	    // flag not thrown
	    this.write('throw e;')
	    this.dedent()
	    this.cr()
	    this.write('}')
	    this.dedent()
	    this.cr()
	    this.write('} finally {')
	    this.indent()
	    this.cr()
	    
	    this.emitFlag(label)
	    this.write(' = false')
	    this.dedent()
	    this.cr()
	    this.write('}')	    
	}

    },

    emit: function(node) {
	var tag = node[0]
	var a   = node[1]
	var b   = node[2]
	var c   = node[3]
	
	switch(tag) {

	case 'IF':
	    this.write('if(')
	    this.emit(a)
	    this.write(') ')
	    this.emitBlock(b)
	    this.write(' else ')

	    if (c[0][0] == 'IF') {
		this.emit(c[0])
	    } else {
		this.emitBlock(c)
	    }
	    break


	case 'DECLARE':
	    this.write('var ')
	    var flag = false
	    for (var i=0; i<b; i++) {
		if (flag) { this.write(', ') } else { flag = true }
		this.write('local_' + a + '_' + i)
	    }
	    break

	case 'PROPERTY':
	    this.emit(a)
	    this.write('[')
	    this.emit(b)
	    this.write(']')
	    break

	case 'RAW':
	    this.write(a)
	    break

	case 'CONST':
	    this.write(typeof a == 'string' ? JSON.stringify(a) : a)
	    break;

	case 'GLOBAL': 
	    this.write(this.globalSymbol)
	    this.write("[\"")
	    this.write(a)
	    this.write(this.namespaceSeparator)
	    this.write(b)
	    this.write("\"]")
	    break

	case 'ARG':
	    this.write("arg_" + a + "_" + b)
	    break

	case 'LOCAL':
	    this.write("local_" + a + "_" + b)
	    break

	case 'SET':
	    this.emit(a)
	    this.write(" = ")
	    this.emit(b)
	    break

	case 'FUN':
	    this.write("function")
	    this.emitList(a)
	    this.write(" ")
	    this.emitBlock(b)
	    break

	case 'CALL':
	    this.emit(a)
	    this.emitList(b)
	    break

	case 'THROW':
	    this.write('throw ')
	    this.emit(a)
	    break

	case 'RETURN':
	    this.write('return ')
	    this.emit(a)
	    break	    

	case 'LOOP':
	    this.emitLabeledBlock('for(;;)', a, b)
	    break

	case 'BLOCK':
	    this.emitLabeledBlock('', a, b)
	    break

	case 'LOCAL_EXIT':
	    this.write('break ')
	    this.emitLabel(a)
	    break

	case 'NON_LOCAL_EXIT':
	    this.emitFlag(a)
	    this.write(' = false; ')
	    this.write('throw "NON_LOCAL_EXIT"')
	    break

	case 'RESTARGS':
	    this.emit(a);
	    this.write(' = [];')	    
	    this.cr()

	    this.write('for(var i='+b+', ii=arguments.length; i<ii; i++) {')

	    this.indent()
	    this.cr()

	    this.emit(a)
	    this.write('.push(arguments[i]);')
	    
	    this.dedent()
	    this.cr()

	    this.write("}")
	    break

	case 'THIS':
	    this.emit(a)
	    this.write(' = this;')
	    break

	default:
	    throw Error('unhandled tag in emitter: ' + tag)

	}

    },

}


// END vegas.emitter.js

// BEGIN vegas.runtime.js

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

// END vegas.runtime.js

// BEGIN vegas.main.js

// adhoc stuff to be removed

var out = process.stdout

function represent(obj, port, escape) {
    if (obj == null) { port.write("#nil") }
    else if (obj.represent) { obj.represent(port, escape) }
}

function representObjects(objs, port, escape, sep) {
    sep = sep || " "
    var flag = false
    for (var i=0; i<objs.length; i++) {
	if (flag) { port.write(sep) } else { flag=true }
	represent(objs[i], port, escape)
    }
}

Boolean.prototype.represent = function(port, _) {
    port.write(this.valueOf() ? "#t" : "#f")
}

Number.prototype.represent = function(port, _) {
    port.write(this.toString())
}

String.prototype.represent = function(port, escape) {
    port.write(escape ? JSON.stringify(this.valueOf()) : this.valueOf())
}

Symbol.prototype.represent = function(port, _) {
    if (this.namespace) {
	port.write(this.namespace + "::" + this.name)
    } else {
	port.write(this.name)
    }
}

Keyword.prototype.represent = function(port, _) {
    port.write(":" + this.name)
}

Array.prototype.represent = function(port, escape) {
    port.write("(")
    representObjects(this, port, escape)
    port.write(")")
}

function prn() {
    representObjects(arguments, out, true)
    out.write("\n")
}

function println() {
    representObjects(arguments, out, false)
    out.write("\n")
}

function prnstr() {
    var _out = out
    var buf  = []
    
    out = { write: function(x) { buf.push(x) } }
    prn.apply(null, arguments)

    out = _out
    return buf.join("")
}

function read(string) {
    var rdr = Reader.create(string, 'test')
    return rdr.readSexp()
}

var inspect = require('util').inspect

function show(x) {
    process.stdout.write(inspect(x, false, null))
    process.stdout.write("\n")
}

function exec(src) {
    return Function('RT', src)(RT)
}

function evaluateTopLevelFragment(sexp) {
    var nsexp   = normalize(sexp) 

    log('\n[NORMALIZE]\n') 
    log(prnstr(nsexp))

    var jsast   = Context.create().compileTopLevelFragment(nsexp)

    log('\n[COMPILE]\n')
    log(prnstr(jsast))

    var warhead = Emitter.bake(jsast)

    log('\n[EMIT]\n')
    log(warhead.toString())
    log('\n')

    return warhead(RT)
}

function evaluateMacroDefinition(sexp) {
    var nsexp = normalize(sexp)

    log('\n[NORMALIZE]\n') 
    log(prnstr(nsexp))

    var jsast = Context.create().compileExpression(nsexp)

    log('\n[COMPILE_MACRO]\n')
    log(prnstr(jsast))

    var warhead = Emitter.bake(jsast)

    log('\n[EMIT_MACRO]\n')
    log(warhead.toString())
    log('\n')

    return warhead(RT)
}

exports.load = function(file) {
    log.clear()

    var fs  = require('fs')
    var txt = fs.readFileSync(file, 'utf8')
    var buf = []

    var rdr = Reader.create(txt, file)
    var exp = new Expander('test',
			   Env.create('test'), 
			   Env.createEmpty())
    var top = exp.createTopLevel()

    while (!rdr.isEmpty()) {

	var rawsexp = rdr.readSexp()

	log('[READ SEXP]\n')
	log(prnstr(rawsexp))

	top.push(rawsexp)

	while(!top.isEmpty()) {
	    var expr = top.expandNext()

	    log('\n[EXPAND SEXP]\n')
	    log(prnstr(expr))

	    var tag = expr[0]

	    switch(tag) {

	    case 'EXPRESSION':
		evaluateTopLevelFragment(expr[1])
		break 

	    case 'DEFINE_MACRO':
		var transformer = evaluateMacroDefinition(expr[2])
		var symbol      = expr[1]				
		exp.symbols.put(symbol, transformer)
		break				
	    }

	}

    }
    
    /*
    while (!rdr.isEmpty()) {
	var ctx = Context.create()
	var sexp   = rdr.readSexp(); prn(sexp)
	var exp    = expander.expandSexp(sexp); prn(exp)
	var norm   = normalize(exp); show(norm)

	ctx.compile(norm, null)
	ctx.declareLocals()
	
	var cmp = ctx.block
	var src = Emitter.emitProgram(cmp); 

	if (ctx.scope.locals > 0) {
	    buf.push("\n!function() {" + src + "\n}();")
	} else {
	    buf.push(src)
	}

	var res = exec(src); prn(res)		

	console.log()

    }
    */

}

// FINAL INITIALIZATION 
var base = Env.create('vegas', true)
var js   = Env.create('js', true)

var specialFormNames = [
    'define*', 'define-macro*', 
    'quote', 'quasiquote', 'unquote', 'unquote-splicing',  
    'fn*', 'do', 'if', 'let', 'letrec', 'unwind-protect', 
    'set', 'block', 'loop', 'return-from', 'throw', 'js*', '.'
].forEach(function(name) {
    var symbol = new Symbol(null, name)
    base.put(symbol, name)    
    Env.addExport('vegas', symbol)
})

RT['vegas::Symbol']  = Symbol
RT['vegas::Keyword'] = Keyword
RT['vegas::Tag']     = Tag
RT['vegas::prn']     = prn
RT['vegas::runtime'] = RT

// quick hack to make sure to add any builtins defined in RT
for (var v in RT) {    
    if (v.substring(0, 7) == 'vegas::') {
	var name = v.replace('vegas::', '')
	var sym  = new Symbol(null, name)
	var qsym = new Symbol('vegas', name)
	base.put(sym, qsym)
	Env.addExport('vegas', sym) 
    }
}

/*
for (var v in RT) {    
    if (v.substring(0, 4) == 'js::')
    var name = v.replace('js::', '')
    var sym  = new Symbol(null, name)
    var qsym = new Symbol('js', name)
    base.put(sym, qsym)
    Env.addExport('vegas', sym)
}
*/

/*
expand('(require vegas)')
expand('(+ 1 1)')
expand('(block :the-block 42)')
expand('(block :the-block (return-from :the-block 42)))')
expand('(if #t (if #f 2 3) 2)')
expand('(throw shit-at-the-wall)')
expand('(fun (x) (* x x))')
expand('(block :the-block ())')
*/


// setup logging

var fs = require('fs')

log = function(txt) {
    fs.appendFile(log.file, txt)
}

log.file = 'log.txt'

log.clear = function() {
    fs.writeFile(log.file, '')
}

// END vegas.main.js
