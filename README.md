OSM Buildings data import
=========================

Finally the OSM import scripts for <a href="http://osmbuildings.org/">OSM Buildings</a>.

Current version is working with MySQL only. If you like to use PostGIS, 
consider contributing some code to this module or use <a href="https://github.com/openstreetmap/osm2pgsql">OSM2PGSQL</a> instead.

# Setup

You'll need NodeJS installed and a running MySQL server.
Run `npm install` to install required node modules.

Create a config file (copy & adapt config.sample.js) with you database parameters.

Download some OSM files, i.e. from <a href="http://download.geofabrik.de">Geofabrik</a> or from <a href="http://metro.teczno.com/">Metro Extraxts</a>.
Don't extract the files, it's done for you automatically :-)

# Import

Run `node import.js {YOURFILE}.osm.bz2`

# Copyright

The BZ2 Extraction code is taken from Apache's BZ2 Toolkit. Respect the according licences.
Despite tha, it's free for all.
