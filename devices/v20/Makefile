# Makefile for V20 Android DTS Patching
# usage: make

PATCHER = ../../android4clone.js
DTC = node ../../dtbtools/dtc-wasm.js
BASE_DTB = rk3326-k36-linux.dtb
STOCK_DTB = rf3536k3ka.dtb
OUT_DTB = rk3326-r36s-android.dtb

# Intermediate/temporary DTS files
BASE_DTS = rk3326-k36-linux.dts
STOCK_DTS = rf3536k3ka.dts
OUT_DTS = rk3326-r36s-android.dts

all: $(OUT_DTB)

$(BASE_DTS): $(BASE_DTB)
	@echo "Decompiling base DTB -> DTS using WASM DTC..."
	$(DTC) -I dtb -O dts -o $(BASE_DTS) $(BASE_DTB)

$(STOCK_DTS): $(STOCK_DTB)
	@echo "Decompiling stock DTB -> DTS using WASM DTC..."
	$(DTC) -I dtb -O dts -o $(STOCK_DTS) $(STOCK_DTB)

$(OUT_DTS): $(BASE_DTS) $(STOCK_DTS) $(PATCHER)
	@echo "Patching DTS..."
	node $(PATCHER) $(BASE_DTS) --stock $(STOCK_DTS) --experimental -o $(OUT_DTS)

$(OUT_DTB): $(OUT_DTS)
	@echo "Compiling patched DTS -> DTB using WASM DTC..."
	$(DTC) -I dts -O dtb -o $(OUT_DTB) $(OUT_DTS) --quiet

clean:
	rm -f $(BASE_DTS) $(STOCK_DTS) $(OUT_DTS) $(OUT_DTB)

.PHONY: all clean
