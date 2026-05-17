const joypad = dtb.get('/odroidgo3-joypad');
if (joypad) {
    logger('Remapping Joypad codes...');
    joypad['pwms'] = [0xf1, 0x00, 0xbebc200, 0x00];
    joypad['pwm-names'] = 'enable';
    
    const mapping = {
        sw1: { code: 0x67, label: 'GPIO DPAD-UP' },
        sw2: { code: 0x6c, label: 'GPIO DPAD-DOWN' },
        sw3: { code: 0x69, label: 'GPIO DPAD-LEFT' },
        sw4: { code: 0x6a, label: 'GPIO DPAD-RIGHT' },
        sw5: { code: 0x130, label: 'GPIO BTN-A' },
        sw6: { code: 0x131, label: 'GPIO BTN-B' },
        sw7: { code: 0x134, label: 'GPIO BTN-Y' },
        sw8: { code: 0x133, label: 'GPIO BTN-X' },
        sw11: { code: 0x9e, label: 'GPIO F3' },
        sw12: { code: 0x7d, label: 'GPIO F4' },
        sw13: { code: 0xac, label: 'GPIO F5' },
        sw15: { code: 0x137, label: 'GPIO TOP-LEFT' },
        sw16: { code: 0x136, label: 'GPIO TOP-RIGHT' },
        sw19: { code: 0x13a, label: 'GPIO F1' },
        sw20: { code: 0x138, label: 'GPIO TOP-RIGHT2' },
        sw21: { code: 0x139, label: 'GPIO TOP-LEFT2' },
        sw22: { code: 0x13b, label: 'GPIO F2' },
    };
    for (const child of joypad.children) {
        const m = mapping[child.$name];
        if (m) {
            child['linux,code'] = m.code;
            child['label'] = m.label;
        }
    }
}
