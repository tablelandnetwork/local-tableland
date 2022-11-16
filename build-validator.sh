cd ../go-tableland

BIN_BUILD_FLAGS="GOOS=darwin GOARCH=amd64" make build-api-debug
mv api ../local-tableland/validator/bin/darwin-amd64

BIN_BUILD_FLAGS="GOOS=darwin GOARCH=arm64" make build-api-debug
mv api ../local-tableland/validator/bin/darwin-arm64

BIN_BUILD_FLAGS="GOOS=linux GOARCH=amd64" make build-api-debug
mv api ../local-tableland/validator/bin/linux-amd64

BIN_BUILD_FLAGS="GOOS=linux GOARCH=arm64" make build-api-debug
mv api ../local-tableland/validator/bin/linux-arm64

BIN_BUILD_FLAGS="GOOS=windows" make build-api-debug
mv api ../local-tableland/validator/bin/windows

cd ../local-tableland
