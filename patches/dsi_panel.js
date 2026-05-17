const dsiPorts = dtb.get('/dsi@ff450000/ports');
if (dsiPorts && !dsiPorts.get('port@1')) {
    const port1 = dsiPorts.add('port@1', {
        'reg': [0x01],
        '#address-cells': [0x01],
        '#size-cells': [0x00],
    });
    port1.add('endpoint', {
        'remote-endpoint': [0x155],
        'phandle': [0x154],
    });
}
const panel = dtb.find('simple-panel-dsi');
if (panel) {
    panel['dsi,flags'] = [0xe03];
    const stockPanel = stock ? stock.find('simple-panel-dsi') : null;
    if (stockPanel) {
        logger('Syncing panel info from stock...');
        const props = ['compatible', 'panel-init-sequence', 'panel-exit-sequence',
          'width-mm', 'height-mm', 'dsi,format', 'dsi,lanes'];
        for (const name of props) {
            const val = stockPanel[name];
            if (val !== undefined) panel[name] = val;
        }
    } else if (!panel.compatible) {
        panel.compatible = ['elida,kd35t133', 'simple-panel-dsi'];
    }
    if (!panel.get('ports')) {
        const ports = panel.add('ports', {
            '#address-cells': [0x01],
            '#size-cells': [0x00],
        });
        const port0 = ports.add('port@0', { reg: [0x00] });
        port0.add('endpoint', {
            'remote-endpoint': [0x154],
            'phandle': [0x155],
        });
    }
}
