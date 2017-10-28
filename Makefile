PER_TICK=10
SIZE=1024
DURATION=5000

bench:
	node benchmark/pub --size $(SIZE) --per-tick $(PER_TICK) --duration $(DURATION) &
	node benchmark/sub --size $(SIZE) --duration $(DURATION)

test:
	@./test/run $(TESTS)

.PHONY: test bench

test:
	@./node_modules/.bin/mocha \
		--reporter dot \
		--timeout 10s \
		--bail

.PHONY: test
