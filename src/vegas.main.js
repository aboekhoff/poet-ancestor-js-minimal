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
