var fs     = require('fs');
var spawn  = require('child_process').spawn;
var path   = require('path');
var util   = require('util');
var events = require('events');

//*****************************************************************************

var Stream = exports.Stream = function(file) {
    events.EventEmitter.call(this);

    if (!fs.statSync(file).isFile()) {
        this.emit('error', 'file \'' + file + '\' not found');
    }

    var lastLine = '';

    var args = ['-jar', path.join(__dirname, 'BZ2Stream.jar'), 'X', file];
    var jar = spawn('java', args);

    jar.stdout.setEncoding('utf8');
    jar.stderr.setEncoding('utf8');

    jar.stdout.on('data', function(str) {
        var lines = (lastLine + str).split('\n');
        for (var i = 0, il = lines.length - 1; i < il; i++) {
            this.emit('data', lines[i]);
        }
        lastLine = lines[il];
    }.bind(this));

    jar.stderr.on('data', function(err) {
        this.emit('error', err);
    }.bind(this));

    jar.on('exit', function() {
        lastLine && this.emit('data', lastLine);
        this.emit('end');
    }.bind(this));

    jar.stdin.end();
};

util.inherits(Stream, events.EventEmitter);
