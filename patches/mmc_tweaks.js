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
