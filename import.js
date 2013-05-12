var Parser = require('./Parser.js').Parser;

//*****************************************************************************

var arguments = process.argv,
    file = arguments[2],
    startDate = Date.now();

if (!file) {
    throw new Error('no import file given');
}

//*****************************************************************************

new Parser(file)
  .on('end', function() {
    console.log('\007\007done in ' + ((Date.now() - startDate) / 1000 / 60).toFixed(2) + 'min');
    process.exit();
  });
