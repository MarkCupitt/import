var fs = require('fs');

var Index = exports.Index = function(dbFile, pageSize) {
    this.pageSize = pageSize || 50000;
    this.itemNum = 0;

    this.fd = fs.openSync(dbFile, 'w+');

    this.id = 0;
    this.offset = 0;
    this.index = [];
    this.queue = {};

    this.watchSearchQueue();
};

var proto = Index.prototype;

proto.add = function(id, data) {
    this.queue[id] = data;
    this.id = id;

    if (this.itemNum === this.pageSize) {
        this.flush();
    }

    this.itemNum++;
};

proto.flush = function() {
    var buffer = new Buffer(JSON.stringify(this.queue) + '\n', 'utf8');
    this.offset += buffer.length;
    fs.writeSync(this.fd, buffer, 0, buffer.length, null);
    this.index.push({ id:this.id, offset:this.offset, queue:[] });
    this.queue = {};
    this.itemNum = 0;
};

proto.findAll = function(idList, callback) {
    var remaining = idList.length;
    for (var i = 0, il = idList.length; i < il; i++) {
        this.find(idList[i], (function(pos) {
            return function(found) {
                idList[pos] = found;
                remaining--;
                if (!remaining) {
                    var res = [];
                    for (var i = 0, il = idList.length; i < il; i++) {
                        if (idList[i]) {
                            res.push(idList[i]);
                        }
                    }
                    callback(res);
                }
            };
        })(i));
    }
};

proto.find = function(id, callback) {
    if (this.queue) {
        this.flush();
        this.queue = null;
    }

    for (var i = 0, il = this.index.length; i < il; i++) {
        if (id <= this.index[i].id) {
            this.index[i].queue.push({ id:id, callback:callback });
            return;
        }
    }
};

proto.watchSearchQueue = function() {
    var indexItem, searchQueue,
        startOffset, bufferSize,
        buffer,
        searchItem;

    for (var i = 0, il = this.index.length; i < il; i++) {
        indexItem = this.index[i];
        searchQueue = indexItem.queue;
        if (this.onEndSearch || searchQueue.length > 100000) {
            while (searchQueue.length) {
                if (i !== this.currentIndex) {
                    startOffset = i ? this.index[i-1].offset : 0;
                    bufferSize = indexItem.offset-startOffset;
                    buffer = new Buffer(bufferSize);
                    fs.readSync(this.fd, buffer, 0, bufferSize, startOffset);
                    this.currentPage = JSON.parse(buffer.toString());
                    this.currentIndex = i;
                }
                searchItem = searchQueue.shift();
                searchItem.callback(this.currentPage[ searchItem.id ]);
            }
        }
    }

    if (this.onEndSearch) {
        this.onEndSearch();
    } else {
        setTimeout(this.watchSearchQueue.bind(this), 1);
    }
};

proto.end = function(onEndSearch) {
    this.onEndSearch = onEndSearch;
};