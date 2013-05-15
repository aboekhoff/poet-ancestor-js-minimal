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
