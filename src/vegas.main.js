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

function read(string) {
    var rdr = Reader.create(string, 'test')
    return rdr.readSexp()
}

[
    ['foo',   Symbol],
    [':bar',  Keyword],
    ['#t',    Boolean],    
    ['42',    Number],
    ['"foo"', String],
    ['()',    Array]
].forEach(function(pair) {
    var string = pair[0]
    var obj    = read(string)
    var type   = pair[1]
    console.log(string, "=>", typeof obj, obj)
});


var expander = new Expander(
    'test',
    Env.create('test'), 
    Env.createEmpty()
)

function expand(src) {
    console.log()

    var sexp = read(src)    
    prn(sexp)

    var result = expander.expandSexp(sexp)
    prn(result)

    var norm = normalize(result)
    prn(norm)

    var cmp = Context.compile(norm, true)

    
    return txt

}

var inspect = require('util').inspect
function show(x) {
    process.stdout.write(inspect(x, false, null))
    process.stdout.write("\n")
}

exports.load = function(file) {
    var fs  = require('fs')
    var txt = fs.readFileSync(file, 'utf8')

    var rdr = Reader.create(txt, file)
    
    while (!rdr.isEmpty()) {
	var sexp   = rdr.readSexp(); prn(sexp)
	var exp    = expander.expandSexp(sexp); prn(exp)
	var norm   = normalize(exp); show(norm)
	var cmp    = Context.compile(norm, true); show(cmp)
	var src    = Emitter.emitProgram(cmp); console.log(src)	
	var res    = exec(src); prn(res)
	console.log()
    }
}

function exec(src) {
    return Function('RT', src)(RT)
}

// FINAL INITIALIZATION 
var base = Env.create('vegas', true)
var js   = Env.create('js', true)

var specialFormNames = [
    'define', 'define-macro',
    'fun', 'do', 'if', 'let', 'letrec', 'unwind-protect', 
    'set', 'block', 'loop', 'return-from', 'throw', 'js*', '.'
].forEach(function(name) {
    var symbol = new Symbol(null, name)
    base.put(symbol, name)    
    Env.addExport('vegas', symbol)
})

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
