var util   = require('util');
var events = require('events');

var Queue = exports.Queue = function (size) {
    events.EventEmitter.call(this);
    this.data = [];
    this.size = size
};

util.inherits(Queue, events.EventEmitter);
var proto = Queue.prototype;

proto.add = function (item) {
    this.data.push(item);
    if (this.data.length >= this.size) {
        this.flush()
    }
};

proto.flush = function () {
    if (this.data.length)  {
        this.emit('flush', this.data);
        this.data = [];
    }
};

proto.end = function () {
    this.flush();
    this.emit('end');
};
