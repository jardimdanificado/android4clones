/**
 * Core patching logic for android4clone.
 * Separated from CLI/File-System logic to allow use in browser.
 */

/** Copy all properties from one wrapped node to another, skipping a list of names. */
export function syncProperties(src, dst, exclude = ['phandle', 'reg']) {
  const rawSrc = src.valueOf();
  for (const prop of rawSrc.properties) {
    if (exclude.includes(prop.name)) continue;
    dst.valueOf().properties = dst.valueOf().properties.filter(p => p.name !== prop.name);
    dst.valueOf().properties.push({ ...prop });
  }
}

export function applyAndroidPatches(dts, stock = null, options = {}) {
  const { experimental = false, logger = console.log } = options;

  logger(`Applying Patches (Experimental: ${experimental ? 'ON' : 'OFF'})...`);

  // ── 1. Root Identity ────────────────────────────────────────────────────────
  const root = dts.get('/');
  if (root) {
    logger('- Preserving root identity from base DTS...');
    logger(`  model:      ${root.model}`);
    logger(`  compatible: ${[root.compatible].flat().join(', ')}`);
  }

  // ── 2. DDR Timing ───────────────────────────────────────────────────────────
  if (stock) {
    const srcDDR = stock.get('/ddr_timing');
    const dstDDR = dts.get('/ddr_timing');
    if (srcDDR && dstDDR) {
      logger('- Syncing ddr_timing from stock...');
      syncProperties(srcDDR, dstDDR);
    }
  }

  // ── 3. Regulator LDO_REG6 (experimental) ───────────────────────────────────
  if (experimental) {
    const ldo6 = dts.get('/i2c@ff180000/pmic@20/regulators/LDO_REG6');
    if (ldo6) {
      logger('- Patching LDO_REG6 (SD Power)...');
      ldo6['regulator-min-microvolt'] = 0x1b7740;
      ldo6['regulator-max-microvolt'] = 0x2dc6c0;
      ldo6['regulator-always-on'] = true;
      ldo6['regulator-boot-on'] = true;

      const stateMem = ldo6.get('regulator-state-mem');
      if (stateMem) stateMem['regulator-suspend-microvolt'] = 0x2dc6c0;
    }
  }

  // ── 4. PWM & MMC (experimental) ────────────────────────────────────────────
  if (experimental) {
    const pwm0 = dts.get('/pwm@ff200000');
    if (pwm0) pwm0.status = 'okay';

    for (const path of ['/dwmmc@ff370000', '/dwmmc@ff380000']) {
      const mmc = dts.get(path);
      if (mmc) {
        logger(`- Boosting ${path} frequency...`);
        mmc['max-frequency'] = 0x8f0d180;
        mmc['vmmc-supply'] = [0x95];
      }
    }
  }

  // ── 5. DSI Graph & Panel ────────────────────────────────────────────────────
  const dsiPorts = dts.get('/dsi@ff450000/ports');
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

  const panel = dts.find('simple-panel-dsi');
  if (panel) {
    panel['dsi,flags'] = [0xe03];

    if (stock && experimental) {
      const stockPanel = stock.find('simple-panel-dsi');
      if (stockPanel) {
        logger('- Syncing panel info from stock...');
        const props = ['compatible', 'panel-init-sequence', 'panel-exit-sequence',
          'width-mm', 'height-mm', 'dsi,format', 'dsi,lanes'];
        for (const name of props) {
          const val = stockPanel[name];
          if (val !== undefined) panel[name] = val;
        }
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

  // ── 6. Joypad ───────────────────────────────────────────────────────────────
  const joypad = dts.get('/odroidgo3-joypad');
  if (joypad) {
    logger('- Remapping Joypad...');

    if (experimental) {
      logger('  * Enabling Joypad PWM...');
      joypad['pwms'] = [0xf1, 0x00, 0xbebc200, 0x00];
      joypad['pwm-names'] = 'enable';
    }

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

  // ── 7. Audio & Battery ──────────────────────────────────────────────────────
  const audioCard = dts.find('simple-audio-card');
  if (audioCard) {
    // Flip GPIO polarity bit in hp-det-gpio cells value
    const raw = audioCard.valueOf();
    const hpDet = raw.properties.find(p => p.name === 'simple-audio-card,hp-det-gpio');
    if (hpDet?.values[0]?.type === 'cells') hpDet.values[0].value[2] = '0x00';
  }

  const battery = dts.find('rk817,battery') ?? dts.get('/i2c@ff180000/pmic@20/battery');
  if (battery) battery.compatible = 'rk817,battery';
}
