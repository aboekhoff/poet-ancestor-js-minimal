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

    if (arguments.length == 1) {
	name      = namespace
	namespace == null
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

