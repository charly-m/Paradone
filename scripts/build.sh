mkdir dist 2>/dev/null
echo "Building..."
./node_modules/.bin/browserify -t babelify -t workerify --standalone paradone src/index.js |
    ./node_modules/.bin/uglifyjs -cm --screw-ie8 --preamble "$(cat ./license.preamble.js)" -o dist/paradone.min.js
echo "Done!"
