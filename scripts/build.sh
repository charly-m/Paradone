mkdir dist 2>/dev/null
./node_modules/.bin/browserify --standalone paradone src/index.js | ./node_modules/.bin/uglifyjs -cm --screw-ie8 --preamble "$(cat ./license.preamble.js)" -o dist/paradone.min.js
