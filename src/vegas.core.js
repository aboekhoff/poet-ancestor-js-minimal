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

function Symbol(namespace, name) {
    this.namespace = namespace;
    this.name      = name;
    this.key       = "#" + name;
    this.tag       = null;
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
    return new Symbol(this.name)
}

function TaggedSymbol(symbol, tag) {
    this.symbol = symbol
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
    return new Symbol(this.key)
}

/*
  Tag objects are simply an Env object and a unique id.
*/

function Tag(env) {
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
   Env objects are linked lists of plain javascript objects.
   They have special support for resolving symbols that have
   been tagged during macroexpansion.
*/

function Env(bindings) {
    this.bindings = bindings;
}

Env.registry = {}

Env.find = function(name) {
    return Env.registry[name] || (Env.registry[name] = new Env({}, null))
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

Env.prototype._get = function(key, notFound) {
    if (key in this.bindings) {
	return this.bindings[key]
    } else if (this.parent) {
	return this.parent._get(key)
    } else {
	return notFound
    }
}

Env.prototype._put = function(key, val) {
    this.bindings[key] = val
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
