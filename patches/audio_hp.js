const audioCard = dtb.find('simple-audio-card');
if (audioCard) {
    const raw = audioCard.valueOf();
    const hpDet = raw.properties.find(p => p.name === 'simple-audio-card,hp-det-gpio');
    if (hpDet?.values[0]?.type === 'cells') {
        logger('Flipped audio jack HP polarity pin...');
        hpDet.values[0].value[2] = '0x00';
    }
}
