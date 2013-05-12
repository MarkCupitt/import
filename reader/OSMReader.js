var util   = require('util');
var events = require('events');
var Stream = require('./BZ2Stream.js').Stream;

//*****************************************************************************

var Reader = exports.Reader = function(fileName) {
    events.EventEmitter.call(this);

    this.mode;

    this.way;
    this.relation;

    new Stream(fileName)
      .on('data', this.parseLine.bind(this))
      .on('error', function(err) {
          throw err;
      })
      .on('end',  this.onEnd.bind(this));
};

util.inherits(Reader, events.EventEmitter);
var proto = Reader.prototype;

proto.parseLine = function(line) {
    var parts = line.split('"');
    var mapping;

    if (!this.mode) {
        if (~parts[0].indexOf('<node ')) {
            this.mode = 'node';
        }
    }

    if (this.mode === 'node') {
        if (~parts[0].indexOf('<way ')) {
            this.mode = 'way';
        } else {
            if (~parts[0].indexOf('<node ')) {
                mapping = this.getMapping(parts, ['id', 'lat', 'lon'])
                this.emit('node', { id:parseInt(parts[mapping.id], 10), lat:parseFloat(parts[mapping.lat]), lon:parseFloat(parts[mapping.lon]) });
            }
        }
	}

    if (this.mode === 'way') {
        if (~parts[0].indexOf('<relation ')) {
            if (this.way) {
                this.emit('way', this.way);
            }
            this.mode = 'relation';
        } else {
            if (~parts[0].indexOf('<way ')) {
                if (this.way) {
                    this.emit('way', this.way);
                }
                this.way = { id:parseInt(parts[1], 10), nodes:[], tags:{} };
            } else if (~parts[0].indexOf('<nd ')) {
                if (this.way) {
                    this.way.nodes.push(parseInt(parts[1], 10));
                }
            } else if (~parts[0].indexOf('<tag ')) {
                if (this.way) {
                    this.way.tags[parts[1]] = parts[3];
                }
            }
        }
    }

    if (this.mode === 'relation') {
        if (~parts[0].indexOf('<relation ')) {
            if (this.relation) {
                this.emit('relation', this.relation);
            }
            this.relation = { id:parseInt(parts[1], 10), members:[], tags:{} };
        } else if (~parts[0].indexOf('<member ')) {
            if (this.relation) {
                mapping = this.getMapping(parts, ['type', 'ref', 'role']);
                this.relation.members.push({ type:parts[mapping.type], ref:parseInt(parts[mapping.ref], 10), role:parts[mapping.role] });
            }
        } else if (~parts[0].indexOf('<tag ')) {
            if (this.relation) {
                this.relation.tags[parts[1]] = parts[3];
            }
        }
    }
};

proto.onEnd = function() {
    if (this.relation) {
        this.emit('relation', this.relation);
    }
    this.emit('end');
};

proto.getMapping = function(data, keys) {
    var res = {};
    for (var i = 0, il = data.length; i < il; i += 2) {
        for (var j = 0, jl = keys.length; j < jl; j++) {
            if (~data[i].indexOf(' ' + keys[j] + '=')) {
                res[keys[j]] = i+1;
                break;
            }
        }
    }
    return res;
};
