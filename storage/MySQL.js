var mysql  = require('mysql'); // 2.0.0-alpha7
var util   = require('util');
var events = require('events');

//*****************************************************************************

var Client = exports.Client = function(config) {
    events.EventEmitter.call(this);

    this.db = mysql.createConnection(config);
    this.db.connect(); // do not chain this

    this.isWatching = false;
};

util.inherits(Client, events.EventEmitter);
var proto = Client.prototype;

proto.query = function(str, args, callback) {
    this._startWatching();
    return this.db.query(str, args, function(err, rows) {
        if (err) {
            console.log('\007');
            throw err;
        }
        callback && callback(rows);
    });
};

proto._startWatching = function() {
    if (this.isWatching) {
        return;
    }
    this.isWatching = true;
    var watchQueue = function() {
        if (this.db._protocol._queue.length) {
            setTimeout(watchQueue, 1000);
            return
        }
        this.emit('drain');
        this.isWatching = false;
    }.bind(this);

    watchQueue();
};
