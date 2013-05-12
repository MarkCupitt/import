var fs     = require('fs');
var util   = require('util');
var events = require('events');

//*****************************************************************************

var Reader = exports.Reader = function (file) {
    events.EventEmitter.call(this);

    if (!fs.statSync(file).isFile()) {
        this.emit('error', 'file \'' + file + '\' not found');
    }

    var lastLine = '';
    fs.createReadStream(file)
        .on('data', function (buffer) {
            var lines = (lastLine + buffer.toString()).split('\n');
            for (var i = 0, il = lines.length - 1; i < il; i++) {
                this.emit('data', lines[i]);
            }
            lastLine = lines[il];
        }.bind(this))
        .on('close', function () {
            if (lastLine) {
                this.emit('data', lastLine);
            }
            this.emit('end');
        }.bind(this))
    ;
};

util.inherits(Reader, events.EventEmitter);
