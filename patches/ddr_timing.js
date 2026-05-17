if (stock) {
    const srcDDR = stock.get('/ddr_timing');
    const dstDDR = dtb.get('/ddr_timing');
    if (srcDDR && dstDDR) {
        logger('Syncing ddr_timing from stock...');
        syncProperties(srcDDR, dstDDR);
    } else {
        logger('ddr_timing node not found in both base and stock.');
    }
} else {
    logger('No stock DTB provided; skipping DDR Timing Sync.');
}
