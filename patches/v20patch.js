// audio
const audioCard = dtb.find('simple-audio-card');
if (audioCard) {
    const raw = audioCard.valueOf();
    const hpDet = raw.properties.find(p => p.name === 'simple-audio-card,hp-det-gpio');
    if (hpDet?.values[0]?.type === 'cells') {
        logger('Flipped audio jack HP polarity pin...');
        hpDet.values[0].value[2] = '0x00';
    }
}

// dsi panel
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

// sd & mmc
const ldo6 = dtb.get('/i2c@ff180000/pmic@20/regulators/LDO_REG6');
if (ldo6) {
    logger('Patching LDO_REG6 (SD Power)...');
    ldo6['regulator-min-microvolt'] = 0x1b7740;
    ldo6['regulator-max-microvolt'] = 0x2dc6c0;
    ldo6['regulator-always-on'] = true;
    ldo6['regulator-boot-on'] = true;
    const stateMem = ldo6.get('regulator-state-mem');
    if (stateMem) stateMem['regulator-suspend-microvolt'] = 0x2dc6c0;
}
const pwm0 = dtb.get('/pwm@ff200000');
if (pwm0) pwm0.status = 'okay';
for (const path of ['/dwmmc@ff370000', '/dwmmc@ff380000']) {
    const mmc = dtb.get(path);
    if (mmc) {
        logger('Boosting ' + path + ' frequency...');
        mmc['max-frequency'] = 0x8f0d180;
        mmc['vmmc-supply'] = [0x95];
    }
}

// joypad
const joypad = dtb.get('/odroidgo3-joypad');
if (joypad) {
    logger('Remapping Joypad codes...');
    joypad['pwms'] = [0xf1, 0x00, 0xbebc200, 0x00];
    joypad['pwm-names'] = 'enable';
    joypad['invert-absrx'] = true;
    joypad['invert-absry'] = true;
    //joypad['amux-channel-mapping'] = [0x2, 0x3, 0x1, 0x0];
    /*const mapping = {
        sw1: { code: 0x67, label: 'GPIO DPAD-UP' },
        sw2: { code: 0x6c, label: 'GPIO DPAD-DOWN' },
        sw3: { code: 0x69, label: 'GPIO DPAD-LEFT' },
        sw4: { code: 0x6a, label: 'GPIO DPAD-RIGHT' },
        sw3: { code: 0x69, label: 'GPIO DPAD-LEFT' },
        sw4: { code: 0x6a, label: 'GPIO DPAD-RIGHT' },
        sw5: { code: 0x130, label: 'GPIO BTN-A' },
        sw6: { code: 0x131, label: 'GPIO BTN-B' },
        sw7: { code: 0x134, label: 'GPIO BTN-Y' },
        sw8: { code: 0x133, label: 'GPIO BTN-X' },
        sw11: { code: 0x9e, label: 'BTN_THUMBR' },
        sw12: { code: 0x7d, label: 'BTN_THUMBL' },
        sw13: { code: 0xac, label: 'GPIO BTN_F' },
        sw15: { code: 0x137, label: 'GPIO TOP-LEFT' },
        sw16: { code: 0x136, label: 'GPIO TOP-RIGHT' },
        //sw19: { code: 0x13a, label: 'BTN_SELECT' },
        sw20: { code: 0x138, label: 'GPIO TOP-RIGHT2' },
        sw21: { code: 0x139, label: 'GPIO TOP-LEFT2' },
        //sw22: { code: 0x13b, label: 'BTN_START' },
    };
    for (const child of joypad.children) {
        const m = mapping[child.$name];
        if (m) {
            child['linux,code'] = m.code;
            child['label'] = m.label;
        }
    }
*/
    //const sw11 = dtb.get('/odroidgo3-joypad/sw11');
    //const sw12 = dtb.get('/odroidgo3-joypad/sw12');
    //const sw15 = dtb.get('/odroidgo3-joypad/sw15');
    //const sw16 = dtb.get('/odroidgo3-joypad/sw16');
    //const sw20 = dtb.get('/odroidgo3-joypad/sw20');
    //const sw21 = dtb.get('/odroidgo3-joypad/sw21');
    //sw11['gpios'] = [0xc3, 0xe, 0x1];
    //sw12['gpios'] = [0xc3, 0xd, 0x1];
}
