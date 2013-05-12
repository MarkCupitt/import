var util   = require('util');
var events = require('events');
var q      = require('./util/Queue.js');
var MySQL  = require('./storage/MySQL.js').Client;
var config = require('./config.js');

//*****************************************************************************

var Storage = exports.Storage = function(region, date) {
    events.EventEmitter.call(this);

    this.tableBuildings = 'buildings',
    this.tableRegions = 'regions';

    this.queue = new q.Queue(3000)
        .on('flush', function(rows) {
            this.db.query('INSERT IGNORE INTO ' + this.tableBuildings + ' (height, min_height, color, roof_color, footprint, region_id, deleted) VALUES \n(' + rows.join('),\n(') + ')');
        }.bind(this));

    this.db = new MySQL(config.db);

    this.db.query('SELECT id FROM ' + this.tableRegions + ' WHERE name = ?', [region], function(res) {
        if (!res[0]) {
            this.db.query('INSERT INTO ' + this.tableRegions + ' (bbox, num_buildings, name, date_created) VALUES (GEOMFROMTEXT(?), ?, ?, ?)', [this.createBBox(-90, 90, -180, 180), 0, region, date], function(res) {
                this.regionId = res.insertId;
                this.emit('ready');
            }.bind(this));
        } else {
            this.regionId = res[0].id;
			this.db.query('UPDATE ' + this.tableBuildings + ' SET deleted = 1 WHERE region_id = ?', [this.regionId]);
            this.db.query('UPDATE ' + this.tableRegions + ' SET bbox = GEOMFROMTEXT(?), num_buildings = 0, date_created = ? WHERE id = ?', [this.createBBox(-90, 90, -180, 180), date, this.regionId], function(res) {
                this.emit('ready');
            }.bind(this));
        }
    }.bind(this));
};

util.inherits(Storage, events.EventEmitter);
var proto = Storage.prototype;

proto.createBBox = function(minLat, maxLat, minLon, maxLon) {
    return 'POLYGON((' +
        minLon + ' ' + maxLat + ', ' +
        maxLon + ' ' + maxLat + ', ' +
        maxLon + ' ' + minLat + ', ' +
        minLon + ' ' + minLat + ', ' +
        minLon + ' ' + maxLat +
    '))';
};

proto.add = function(tags, footprint) {
    this.queue.add([
        tags.height || 'NULL',
        tags.minHeight || 'NULL',
        tags.color ? '"' + tags.color + '"' : 'NULL',
        tags.roofColor ? '"' + tags.roofColor + '"' : 'NULL',
        'GEOMFROMTEXT("POLYGON((' + footprint.join(',') + '))")',
        this.regionId,
        'NULL'
    ].join(','));
};

proto.end = function() {
    this.queue.flush();

	this.db.query(
        'SELECT COUNT(region_id) AS num_buildings,' +
        '  MIN( X(PointN(ExteriorRing(Envelope(footprint)), 1)) ) AS minLat,' +
        '  MAX( X(PointN(ExteriorRing(Envelope(footprint)), 3)) ) AS maxLat,' +
        '  MIN( Y(PointN(ExteriorRing(Envelope(footprint)), 1)) ) AS minLon,' +
        '  MAX( Y(PointN(ExteriorRing(Envelope(footprint)), 3)) ) AS maxLon ' +
        'FROM ' + this.tableBuildings + ' ' +
        'WHERE region_id = ? AND deleted IS NULL',
    [this.regionId],
    function(res) {
        var region = res[0];
        if (region.num_buildings) {
            this.db.query('UPDATE ' + this.tableRegions + ' SET bbox = GEOMFROMTEXT(?), num_buildings = ? WHERE id = ?', [this.createBBox(region.minLat, region.maxLat, region.minLon, region.maxLon), region.num_buildings, this.regionId]);
        }
        this.db.on('drain', function() {
            this.emit('end');
        }.bind(this));
    }.bind(this));
};
