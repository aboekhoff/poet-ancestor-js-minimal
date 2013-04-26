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

Expander.prototype.maybeResolveToMacro = function(sexp) {
}

Expander.prototype.maybeResolveToSpecialForm = function(sexp) {
}

Expander.prototype.maybeResolveToDo = function(sexp) {
    return this.maybeResolveToSpecialForm(sexp) == 'do'
}

Expander.prototype.maybeResolveToDefine = function(sexp) {
    return this.maybeResolveToSpecialForm(sexp) == 'define'
}

Expander.prototype.maybeResolveToDefineMacro = function(sexp) {    
    return this.maybeResolveToSpecialForm(sexp) == 'define-macro'
}

Expander.prototype.macroexpand1 = function(sexp) {
    if (sexp instanceof Array) {
	var macro = this.maybeResolveToMacro(sexp[0])
	if (macro) { return macro(sexp, this) }
    }   
    return sexp
}

Expander.prototype.macroexpand = function(sexp) {
    var _sexp = this.macroexpand1(sexp)
    return sexp == _sexp ? _sexp : this.macroexpand(_sexp)
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
    return qualifiedSymbol
}

Expander.prototype.bindLocal = function(symbol) {
    var reifiedSymbol = symbol.reify()
    symbols.put(symbol, reifiedSymbol)
    return reifiedSymbol
}

Expander.prototype.expandArray = function(sexp) {
    var sf = this.maybeResolveToSpecialForm(sexp[0])
    return sf ? this.expandSpecialForm(sf, sexp) : this.expandCall(sexp)
}

Expander.prototype.expandCall = function(callee, args) {
    return [Symbol.coreSymbol('call'), 
	    this.expandSexp(callee), 
	    this.expandSexps(args)]
}

Expander.prototype.expandBody = function(body) {
    var input  = body.slice()
    var output = []

    while (input.length > 0) {
	var sexp = input.unshift()
	if (this.maybeResolveToBegin(sexp)) {
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

Expander.prototype.expandCond = function(clauses) {
    var _clauses = []
    for (var i=0; i<clauses.length; i++) {
	var test       = this.expandSexp(clauses[i][0])
	var consequent = this.expandSexp(clauses[i][1])
	_clauses.push([test, consequent])
    }
    return [Symbol.coreSymbol('cond')].concat(_clauses)
}

Expander.prototype.expandFn = function(args, body) {
    var exp   = this.extendSymbols()
    var _args = []
    for (var i=0; i<args.length; i++) {
	_args[i] = exp.bindLocal(args[i])
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
	_bindings.push([expr, local])
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

Expander.prototype.expandUnwindProtect = function(clauses) {
    // FIXME
}

Expander.prototype.expandSpecialForm = function(name, sexp) {
    switch(name) {

    case 'fn*':         
	return this.expandFn(sexp[1], sexp.slice(2))

    case 'do':
	return this.expandBody(sexp.slice(1))

    case 'cond':
	return this.expandCond(sexp.slice(1))

    case 'let':        	
	return this.expandLet(sexp[1], sexp.slice(2))

    case 'letrec':     
	return this.expandLetrec(sexp[1], sexp.slice(2))

    case 'unwind-protect':
	return this.expandUnwindProtect(sexp.slice(1))

    case 'call':
	return this.expandCall(sexp[1], sexp.slice(2))

    case 'set':        
	return [Symbol.coreSymbol('set'), 
		this.expandSexp(sexp[1]),
	        this.expandSexp(sexp[2])]

    case 'block':
	var exp   = this.extendLabels()
	var label = exp.bindLabel(sexp[1])
	var body  = exp.expandBody(sexp.slice(2))
	return [exp.coreSymbol('block'), label, body]
	
    case 'loop':
	var exp = this.extendLabels()
	exp.bindLabel(null)
	return [exp.coreSymbol('loop'), 
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

    }
}

console.log(Expander.prototype)
console.log(Symbol.coreSymbol('js*'))
