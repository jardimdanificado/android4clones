# Makefile for V20 Android DTS Patching
# usage: make

PATCHER = ../../android4clone.js
BASE_DTS = rk3326-k36-linux.dts
STOCK_DTS = rf3536k3ka.dts
OUT_DTS = rk3326-r36s-android.dts
OUT_DTB = rk3326-r36s-android.dtb

all: $(OUT_DTB)

$(OUT_DTS): $(BASE_DTS) $(STOCK_DTS) $(PATCHER)
	@echo "Patching DTS..."
	node $(PATCHER) $(BASE_DTS) --stock $(STOCK_DTS) --experimental -o $(OUT_DTS)

$(OUT_DTB): $(OUT_DTS)
	@echo "Compiling to DTB..."
	dtc -O dtb -I dts -o $(OUT_DTB) $(OUT_DTS) --quiet

clean:
	rm -f $(OUT_DTS) $(OUT_DTB)

.PHONY: all clean
