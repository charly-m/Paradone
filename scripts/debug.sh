mkdir dist 2>/dev/null
echo "Start building..."
watchify src/extensions/gossipWorker.js -dv -o dist/gossipWorker.js &
watchify src/index.js --standalone paradone -dv -o dist/paradone.js &
wait
