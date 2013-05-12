var fs      = require('fs');
var path    = require('path');
var util    = require('util');
var events  = require('events');
var Index   = require('./util/Index.js').Index;
var Reader  = require('./reader/OSMReader.js').Reader;
var Storage = require('./MySQLStorage.js').Storage;

//*****************************************************************************

var METERS_PER_LEVEL = exports.METERS_PER_LEVEL = 3;
var YARD_TO_METER    = exports.YARD_TO_METER = 0.9144;
var FOOT_TO_METER    = exports.FOOT_TO_METER = 0.3048;
var INCH_TO_METER    = exports.INCH_TO_METER = 0.0254;

//*****************************************************************************

var Parser = exports.Parser = function(file) {
    events.EventEmitter.call(this);

    this.pointIndex   = new Index('points.db', 300000);
    this.polygonIndex = new Index('polygons.db', 75000);

    var regionName = path.basename(file, '.osm.bz2').replace(/-latest$/, '');
    var d = fs.statSync(file).mtime;
    var date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()-d.getTimezoneOffset()).toISOString().substring(0, 10);

    this.storage = new Storage(regionName, date)
      .on('ready', function() {
          new Reader(file)
            .on('node',     this.processNode.bind(this))
            .on('way',      this.processWay.bind(this))
            .on('relation', this.processRelation.bind(this))
            .on('end', this.end.bind(this));
        }.bind(this))
      .on('end', function() {
          this.emit('end');
        }.bind(this));
};

util.inherits(Parser, events.EventEmitter);
var proto = Parser.prototype;

proto.parseSize = function(str) {
    var value = parseFloat(str),
        round = Math.round;

    if (~str.indexOf('m')) {
        return round(value);
    }
    if (~str.indexOf('yd')) {
        return round(value * YARD_TO_METER);
    }
    if (~str.indexOf('ft')) {
        return round(value * FOOT_TO_METER);
    }
    if (~str.indexOf('\'')) {
        var parts = str.split('\'');
        var res = parts[0]*FOOT_TO_METER + parts[1]*INCH_TO_METER;
        return round(res);
    }
    return round(value);
};

proto.getType = function(tags) {
    if (tags.amenity === 'place_of_worship') {
        return 'worship';
    }

    var type;
    type = tags.building;
    if (type === 'yes' || type === 'roof') {
        type = tags['building:use'];
    }
    if (!type) {
        type = tags.amenity;
    }

	switch (type) {
        case 'apartments':
		case 'house':
		case 'residential':
		case 'hut':
			return 'living';
		case 'church':
			return 'worship';
	}

	return 'nonliving';
};

proto.getColor = function(str) {
    str = str.toLowerCase();

    if (str[0] === '#') {
        return str;
    }

    var colors = {
        black: '#000000',
        white: '#ffffff',
        brown: '#8b4513',
        green: '#00ff7f',
        grey: '#bebebe',
        gray: '#bebebe',
        lightgrey: '#d3d3d3',
        lightgray: '#d3d3d3',
        yellow: '#ffff00',
        red: '#ff0000'//,
//      living: '#f08060',
//		nonliving: '#cccccc',
//		worship: '#80f080'
	};

    return colors[str] || null;
};

proto.getMaterial = function(str) {
    str = str.toLowerCase();

    if (str[0] === '#') {
        return str;
    }

    var materials = {
        asphalt: 'tar_paper',
        bitumen: 'tar_paper',
        block: 'stone',
        bricks: 'brick',
        glas: 'glass',
        glassfront: 'glass',
        gras: 'grass',
        gravel: 'stone',
        panels: 'panel',
        paving_stones: 'stone',
        plastered: 'plaster',
        rooftiles: 'roof_tiles',
        sandstone: 'stone',
        sheet: 'canvas',
        sheets: 'canvas',
        shingle: 'tar_paper',
        shingles: 'tar_paper',
        slates: 'slate',
        steel: 'metal',
        tar: 'tar_paper',
        tile: 'roof_tiles',
        tiles: 'roof_tiles'
	};

    return materials[str] || str;
};

proto.processNode = function(node) {
    this.pointIndex.add(node.id, node.lat.toFixed(5) + ' ' + node.lon.toFixed(5));
};

proto.processWay = function(way) {
    var tags;
    if (this.isBuilding(way)) {
        tags = this.filterTags(way.tags);
        this.getFootprint(way.nodes, function(footprint) {
            if (footprint) {
                this.storage.add(tags, footprint);
            }
        }.bind(this));
    } else {
        tags = way.tags;
        if (!tags.highway && !tags.railway && !tags.landuse) { // TODO: add more filters
            this.polygonIndex.add(way.id, way);
        }
    }
};

proto.processRelation = function(relation) {
    if (this.isBuilding(relation) && (relation.tags.type === 'multipolygon' || relation.tags.type === 'building')) {
        var outerWay = this.getOuterWay(relation.members);
        if (outerWay) {
            var relTags = this.filterTags(relation.tags);
            this.polygonIndex.find(outerWay.ref, function(way) {
                if (way) {
                    var tags = this.filterTags(way.tags);
                    this.getFootprint(way.nodes, function(footprint) {
                        if (footprint) {
                            tags = this.mergeTags(tags, relTags);
                            this.storage.add(tags, footprint);
                        }
                    }.bind(this));
                }
            }.bind(this));
        }
    }
};

proto.isBuilding = function(data) {
    var tags = data.tags;
    return (tags
        && !tags.landuse
        && (tags.building || tags['building:part'])
        && (!tags.layer || tags.layer >= 0));
};

proto.getOuterWay = function(ways) {
    var w;
    for (var i = 0, il = ways.length; i < il; i++) {
        w = ways[i];
        if (w.type === 'way' && w.role === 'outer') {
            return w;
        }
    }
};

proto.mergeTags = function(dst, src) {
    for (var p in src) {
        if (!dst[p]) {
            dst[p] = src[p]
        }
    }
    return dst;
};

proto.filterTags = function(tags) {
    // height
    var height = 0, minHeight = 0
        round = Math.round;

    if (tags.height) {
        height = this.parseSize(tags.height);
    }
    if (!height && tags['building:height']) {
        height = this.parseSize(tags['building:height']);
    }

    if (!height && tags.levels) {
        height = round(tags.levels * METERS_PER_LEVEL);
    }
    if (!height && tags['building:levels']) {
        height = round(tags['building:levels'] * METERS_PER_LEVEL);
    }

    // min_height
    if (tags.min_height) {
        minHeight = this.parseSize(tags.min_height);
    }
    if (!minHeight && tags['building:min_height']) {
        minHeight = this.parseSize(tags['building:min_height']);
    }

    if (!minHeight && tags.min_level) {
        minHeight = round(tags.min_level * METERS_PER_LEVEL);
    }
    if (!minHeight && tags['building:min_level']) {
        minHeight = round(tags['building:min_level'] * METERS_PER_LEVEL);
    }

    // wall material
    if (tags['building:material']) {
        color = this.getMaterial(tags['building:material']);
    }
    if (tags['building:facade:material']) {
        color = this.getMaterial(tags['building:facade:material']);
    }
    if (tags['building:cladding']) {
        color = this.getMaterial(tags['building:cladding']);
    }
    // wall color
    var color;
    if (tags['building:color']) {
        color = this.getColor(tags['building:color']);
    }
    if (tags['building:colour']) {
        color = this.getColor(tags['building:colour']);
    }

    // roof material
    if (tags['roof:material']) {
        roofColor = this.getMaterial(tags['roof:material']);
    }
    if (tags['building:roof:material']) {
        roofColor = this.getMaterial(tags['building:roof:material']);
    }
    // roof color
    var roofColor;
    if (tags['roof:color']) {
        roofColor = this.getColor(tags['roof:color']);
    }
    if (tags['roof:colour']) {
        roofColor = this.getColor(tags['roof:colour']);
    }
    if (tags['building:roof:color']) {
        roofColor = this.getColor(tags['building:roof:color']);
    }
    if (tags['building:roof:colour']) {
        roofColor = this.getColor(tags['building:roof:colour']);
    }

//    if (!roofColor) {
//        var type = this.getType(data);
//        if (type === 'worship') {
//            roofColor = this.getColor(type);
//        }
//    }

// "man_made":"water_tower"
// "man_made":"tower"
//
//drawSpecialBuildings("leisure", "stadium", 12, "man_made_tower", "man_made_tower");
//drawSpecialBuildings("building:part", null, 3, "building", "building");
//drawSpecialBuildings("man_made", "tower", 25, "man_made_tower", "building_nonliving_roof1");
//drawSpecialBuildings("amenity", "tower", 25, "man_made_tower", "building_nonliving_roof1");
//drawSpecialBuildings("man_made", "chimney", 50, "man_made_tower", null);
//
//drawTowers("artwork_type", "obelisk", 4, 25, "man_made_tower"); //FIXME: for testing only
//drawTowers("man_made", "tower", 4, 25, "man_made_tower");
//drawTowers("amenity", "tower", 4, 25, "man_made_tower");

    return {
        height: height,
        minHeight: minHeight,
        color: color,
        roofColor: roofColor
    };
};

proto.getFootprint = function(points, callback) {
    if (!points) {
        callback();
        return;
    }

    var length = points.length;

    // do not close polygon yet
    if (points[length-1] === points[0]) {
        points.pop();
        length--;
    }

    // can't span a polygon with just 2 points
    if (length < 3) {
        callback();
        return;
    }

    this.pointIndex.findAll(points, function(footprint) {
        // can't span a polygon with just 2 points
        if (footprint.length < 3) {
            callback();
            return;
        }

        // now close the polygon
        footprint.push(footprint[0]);

        callback(footprint);
    });
};

proto.end = function() {
    this.polygonIndex.end(function() {
        this.pointIndex.end(function() {
            this.storage.end();
        }.bind(this));
    }.bind(this));
};
