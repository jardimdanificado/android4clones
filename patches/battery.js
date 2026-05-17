const battery = dtb.find('rk817,battery') ?? dtb.get('/i2c@ff180000/pmic@20/battery');
if (battery) {
    logger('Standardizing battery driver compatible string...');
    battery.compatible = 'rk817,battery';
}
