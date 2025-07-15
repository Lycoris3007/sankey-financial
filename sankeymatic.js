/*
SankeyMATIC
A Sankey diagram builder for everyone
by Steve Bogart (@nowthis; http://nowthis.com/; sbogart@sankeymatic.com)

Requires:
  D3.js
    - https://github.com/d3/d3 v7.x
  canvg.js
    - https://github.com/canvg/canvg v3.0.9
*/

(function sankeymatic(glob) {
'use strict';

// 'glob' points to the global object, either 'window' (browser) or 'global' (node.js)
// This lets us contain everything in an IIFE (Immediately-Invoked Function Expression)

// Initialize when DOM is ready
function initializeSankeymatic() {
  // 初始化所有必需的元素
  const requiredElements = [
    'flows_in',
    'layout_reversegraph',
    'labelvalue_color',
    'console_area',
    'issue_messages',
    'imbalance_messages',
    'totals_area',
    'info_messages',
    'console_lines'
  ];

  // 检查所有必需的元素是否存在
  const missingElements = requiredElements.filter(id => !document.getElementById(id));
  if (missingElements.length > 0) {
    console.error('Missing required elements:', missingElements);
    return;
  }

  // 初始化页面
  loadFromQueryString();
  // 渲染当前输入
  glob.process_sankey();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSankeymatic);
} else {
  initializeSankeymatic();
}

// el: shorthand for grabbing a DOM element, often to modify it
// elV: used if all we want is to READ the .value
function el(domId) { 
  const element = document.getElementById(domId);
  if (!element) {
    console.warn(`Element not found: ${domId}`);
    // Return a dummy element with default values to prevent null errors
    return {
      value: '',
      checked: false,
      style: { display: 'none' },
      classList: { add: () => {}, remove: () => {}, replace: () => {} }
    };
  }
  return element;
}
function elV(domId) { 
  const element = document.getElementById(domId);
  if (!element) {
    console.warn(`Element not found: ${domId}`);
    return '';
  }
  return element.value || '';
}

// togglePanel: Called directly from the page.
// Given a panel's name, hide or show that control panel.
glob.togglePanel = (panel) => {
  const panelEl = el(panel),
    displayStyle = panelEl.tagName === 'SPAN' ? 'inline' : '',
    // Set up the new values:
    newVals = panelEl.style.display === 'none'
      ? { display: displayStyle, suffix: ':', action: String.fromCharCode(8211) }
      : { display: 'none', suffix: '...', action: '+' };
  panelEl.style.display = newVals.display;
  el(`${panel}_hint`).textContent = newVals.suffix;
  el(`${panel}_indicator`).textContent = newVals.action;
  return null;
};

/**
 * Kick off a function after a certain period has passed.
 * Used to trigger live updates when the user stops typing.
 * @param {function} callbackFn
 * @param {number} [waitMilliseconds = 500] Default is 500.
 * @returns {function}
 */
function debounce(callbackFn, waitMilliseconds = 500) {
  let timeoutID;
  const delayedFn = function (...params) {
    if (timeoutID !== undefined) { clearTimeout(timeoutID); }
    timeoutID = setTimeout(() => callbackFn(...params), waitMilliseconds);
  };
  return delayedFn;
}

function outputFieldEl(fld) { return el(`${fld}_val`); }

// We store the breakpoint which means 'never' here for easy reference.
// When there are valid inputs, this is set to (stages count + 1).
glob.labelNeverBreakpoint = 9999;

/**
 * Update the range on the label-breakpoint slider
 * @param {number} newMax
 */
glob.resetMaxBreakpoint = (newMax) => {
  const elBreakpointSlider = el(breakpointField);
  elBreakpointSlider.setAttribute('max', String(newMax));
  glob.labelNeverBreakpoint = newMax;
};

// updateOutput: Called directly from the page.
// Given a field's name, update the visible value shown to the user.
glob.updateOutput = (fld) => {
  /**
   * Given a whole number from 50-150, add '%' and pad it if needed.
   * @param {number} pct - number to display as a percentage
   * @returns {string} formatted string, padded with invisible 0s if needed
   */
  function padPercent(pct) {
    const pctS = String(pct);
    if (pctS.length === 3) { return `${pctS}%`; }
    return `<span class="invis">${'0'.repeat(3 - pctS.length)}</span>${pctS}%`;
  }

  const fldVal = elV(fld),
    fldValAsNum = Number(fldVal),
    oEl = outputFieldEl(fld);

  // Special handling for relative % ranges. To keep the numbers from jumping
  // around as you move the slider, we always show 3 digits for each value,
  // even if one is an invisible 0.
  if (['labels_magnify', 'labels_relativesize'].includes(fld)) {
    if (fldValAsNum === 100) {
      oEl.textContent = 'Same size';
    } else {
      oEl.innerHTML
        = `${padPercent(200 - fldValAsNum)} — ${padPercent(fldValAsNum)}`;
    }
    return null;
  }

  const formats = {
      node_h: '%',
      node_spacing: '%',
      node_opacity: '.2',
      flow_curvature: '|',
      flow_opacity: '.2',
      labelname_weight: 'font',
      labels_highlight: '.2',
      labels_linespacing: '.2',
      labelposition_autoalign: 'align',
      labelposition_breakpoint: 'breakpoint',
      labelvalue_weight: 'font',
      labelchange_weight: 'font',
      title_weight: 'font',
      labelvalue_color: 'color',
      labelname_color: 'color',
      labelchange_color: 'color',
      label_margin_fixed: 'yn',
      label_margin_left: 'whole',
      label_margin_right: 'whole',
    },
    alignLabels = new Map([[-1, 'Before'], [0, 'Centered'], [1, 'After']]),
    fontWeights = { 100: 'Light', 400: 'Normal', 700: 'Bold' };
  switch (formats[fld]) {
    case '|':
      // 0.1 is treated as 0 for curvature. Display that:
      if (fldValAsNum <= 0.1) { oEl.textContent = '0.00'; break; }
      // FALLS THROUGH to '.2' format when fldValAsNum > 0.1:
    case '.2': oEl.textContent = d3.format('.2f')(fldValAsNum); break;
    case '%': oEl.textContent = `${d3.format('.1f')(fldValAsNum)}%`; break;
    case 'breakpoint':
      oEl.textContent = fldValAsNum === glob.labelNeverBreakpoint
            ? 'Never'
            : `Stage ${fldVal}`;
      break;
    case 'font':
      oEl.textContent = fontWeights[fldValAsNum] ?? fldVal; break;
    case 'align':
      oEl.textContent = alignLabels.get(fldValAsNum) ?? fldVal; break;
    default: oEl.textContent = fldVal;
  }
  return null;
};

glob.revealVal = (fld) => {
  // First make sure the value is up to date.
  glob.updateOutput(fld);

  // Swap classes to make the output appear:
  const cl = outputFieldEl(fld).classList;
  cl.remove('fade-init', 'fade-out');
  cl.add('fade-in');
  return null;
};

glob.fadeVal = (fld) => {
  outputFieldEl(fld).classList.replace('fade-in', 'fade-out');
  return null;
};

// isNumeric: borrowed from jQuery/Angular
function isNumeric(n) { return !Number.isNaN(n - parseFloat(n)); }

// clamp: Ensure a value n (if numeric) is between min and max.
// Default to min if not numeric.
function clamp(n, min, max) {
  return isNumeric(n) ? Math.min(Math.max(Number(n), min), max) : min;
}

// radioRef: get the object which lets you get/set a radio input value:
function radioRef(rId) { return document.forms.skm_form.elements[rId]; }

// checkRadio: Given a radio field's id, check it.
glob.checkRadio = (id) => { el(id).checked = true; };

// If the current inputs came from some external source, name it in this string:
glob.newInputsImportedFrom = null;

/**
 * Used when we're replacing the current diagram with something new - whether
 * from a file or from a string in the URL.
 * Also resets the maximum stage breakpoint for label positions
 * @param {string} newData - the data which should go in the "Inputs" textarea
 * @param {string} dataSource - where the tool should say the data came from
 */
function setUpNewInputs(newData, dataSource) {
  // Add in settings which the source might lack, to preserve the
  // original look of older diagrams:
  el(userInputsField).value = settingsToBackfill + newData;
  // Reset breakpoint values to allow a high one in any imported diagram:
  glob.resetMaxBreakpoint(MAXBREAKPOINT);
  glob.newInputsImportedFrom = dataSource;
}

// rememberedMoves: Used to track the user's repositioning of specific nodes
// (which should be preserved across diagram renders).
// Format is: nodeName => [moveX, moveY]
glob.rememberedMoves = new Map();

// resetMovesAndRender: Clear all manual moves of nodes AND re-render the
// diagram:
glob.resetMovesAndRender = () => {
  glob.rememberedMoves.clear();
  glob.process_sankey();
  return null;
};

function updateResetNodesUI() {
  // Check whether we should enable the 'reset moved nodes' button:
  el('reset_all_moved_nodes').disabled = !glob.rememberedMoves.size;
}

// contrasting_gray_color:
// Given any hex color, return a grayscale color which is lower-contrast than
// pure black/white but still sufficient. (Used for less-important text.)
function contrasting_gray_color(hc) {
  const c = d3.rgb(hc),
    yiq = (c.r * 299 + c.g * 587 + c.b * 114) / 1000,
    // Calculate a value sufficiently far away from this color.
    // If it's bright-ish, make a dark gray; if dark-ish, make a light gray.
    // This algorithm is far from exact! But it seems good enough.
    // Lowest/highest values produced are 59 and 241.
    gray = Math.floor(yiq > 164 ? (0.75 * yiq) - 64 : (0.30 * yiq) + 192);
  return d3.rgb(gray, gray, gray);
}

// escapeHTML: make any input string safe to display.
// Used for displaying raw <SVG> code
// and for reflecting the user's input back to them in messages.
function escapeHTML(unsafeString) {
  return unsafeString
     .replaceAll('→', '&#8594;')
     .replaceAll('&', '&amp;')
     .replaceAll('<', '&lt;')
     .replaceAll('>', '&gt;')
     .replaceAll('"', '&quot;')
     .replaceAll("'", '&#039;')
     .replaceAll('\n', '<br />');
}

// ep = "Enough Precision". Converts long decimals to have just 5 digits.
// Why?:
// SVG diagrams produced by SankeyMATIC don't really benefit from specifying
// values with more than 3 decimal places, but by default the output has *13*.
// This is frankly hard to read and actually inflates the size of the SVG
// output by quite a bit.
//
// Result: values like 216.7614485930364 become 216.76145 instead.
// The 'Number .. toString' call allows shortened output: 8 instead of 8.00000
function ep(x) { return Number(x.toFixed(5)).toString(); }

// updateMarks: given a US-formatted number string, replace with user's
// preferred separators:
function updateMarks(stringIn, numberMarks) {
  // If the digit-group mark is a comma, implicitly the decimal is a dot...
  // That's what we start with, so return with no changes:
  if (numberMarks.group === ',') { return stringIn; }

  // Perform hacky mark swap using ! as a placeholder:
  return stringIn.replaceAll(',', '!')
    .replaceAll('.', numberMarks.decimal)
    .replaceAll('!', numberMarks.group);
}

// formatUserData: produce a value in the user's designated format:
function formatUserData(numberIn, nStyle) {
  const nString = updateMarks(
    d3.format(`,.${nStyle.decimalPlaces}${nStyle.trimString}f`)(numberIn),
    nStyle.marks
  );
  return `${nStyle.prefix}${nString}${nStyle.suffix}`;
}

// initializeDiagram: Reset the SVG tag to have the chosen size &
// background (with a pattern showing through if the user wants it to be
// transparent):
function initializeDiagram(cfg) {
  const svgEl = el('sankey_svg');
  if (!svgEl) {
    console.error('SVG element not found');
    return;
  }
  svgEl.setAttribute('height', cfg.size_h);
  svgEl.setAttribute('width', cfg.size_w);
  svgEl.setAttribute(
    'class',
    `svg_background_${cfg.bg_transparent ? 'transparent' : 'default'}`
  );
  svgEl.innerHTML = ''; // 使用innerHTML替代textContent以确保完全清空
}

// fileTimestamp() => 'yyyymmdd_hhmmss' for the current locale's time.
// Set up the formatting function once:
const formatTimestamp = d3.timeFormat('%Y%m%d_%H%M%S');
glob.fileTimestamp = () => formatTimestamp(new Date());

// humanTimestamp() => readable date in the current locale,
// e.g. "1/3/2023, 7:33:31 PM"
glob.humanTimestamp = () => new Date().toLocaleString();

// Logo图片的base64数据（避免CORS问题）
const LOGO_BASE64 = 'data:image/png;base64,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';

// scaledPNG: Build a data URL for a PNG representing the current diagram:
async function scaledPNG(scale) {
  try {
    const svgEl = el('sankey_svg');
    const scaleFactor = clamp(scale, 1, 6);

    // 获取原始尺寸
    const width = parseInt(svgEl.getAttribute('width'));
    const height = parseInt(svgEl.getAttribute('height'));

    // 计算缩放后的尺寸
    const scaled = {
      w: width * scaleFactor,
      h: height * scaleFactor
    };

    // 创建包含logo图片的SVG（使用嵌入的base64数据）
    // 原始logo尺寸: 813x192, 按比例缩放到合适大小
    const logoWidth = 160;
    const logoHeight = Math.round(logoWidth * 192 / 813); // 保持原始比例
    const logoSvg = `
      <g id="sankeymatic-logo">
        <image x="${width / 2 - logoWidth/2}" y="${height - logoHeight - 10}" width="${logoWidth}" height="${logoHeight}"
               href="${LOGO_BASE64}" opacity="0.9"/>
      </g>
    `;

    // 创建一个新的SVG字符串，包含完整的命名空间、样式和logo
    const svgData = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
      <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
        width="${scaled.w}" height="${scaled.h}" viewBox="0 0 ${width} ${height}"
        style="background-color: white;">
        ${svgEl.innerHTML}
        ${logoSvg}
      </svg>`;

    // 创建Blob
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);

    // 创建Image对象
    const img = new Image();
    
    // 等待图片加载
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = (error) => {
        console.error('Image load error:', error);
        reject(new Error('Failed to load SVG image'));
      };
      img.src = svgUrl;
    });

    // 创建canvas
    const canvas = document.createElement('canvas');
    canvas.width = scaled.w;
    canvas.height = scaled.h;
    
    // 绘制到canvas
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 确保图像已完全加载
    if (img.complete && img.naturalWidth !== 0) {
      ctx.drawImage(img, 0, 0, scaled.w, scaled.h);
    } else {
      throw new Error('Image not properly loaded');
    }

    // 清理
    URL.revokeObjectURL(svgUrl);

    // 返回结果
    const pngUrl = canvas.toDataURL('image/png');
    if (!pngUrl || pngUrl === 'data:,') {
      throw new Error('Failed to generate PNG data URL');
    }
    
    return [scaled, pngUrl];
  } catch (error) {
    console.error('PNG generation error:', error);
    throw error;
  }
}

// downloadABlob: given an object & a filename, send it to the user:
function downloadADataURL(dataURL, name) {
  const newA = document.createElement('a');
  newA.style.display = 'none';
  newA.href = dataURL;
  newA.download = name;
  document.body.append(newA);
  newA.click(); // This kicks off the download
  newA.remove(); // Discard the Anchor we just clicked; it's no longer needed
}

glob.saveDiagramAsPNG = async (scale) => {
  const loadingMsg = document.createElement('div');
  loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); ' +
    'background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 10px; z-index: 9999;';
  loadingMsg.textContent = 'Generating PNG...';
  
  try {
    document.body.appendChild(loadingMsg);
    const [size, pngURL] = await scaledPNG(scale);
    
    if (!pngURL || pngURL.length < 100) {
      throw new Error('Generated PNG appears to be invalid');
    }
    
    downloadADataURL(
      pngURL,
      `sankeymatic_${glob.fileTimestamp()}_${size.w}x${size.h}.png`
    );
  } catch (error) {
    console.error('Error saving PNG:', error);
    alert('Failed to save PNG: ' + (error.message || 'Unknown error'));
  } finally {
    document.body.removeChild(loadingMsg);
  }
};

// downloadATextFile: given a string & a filename, send it to the user:
function downloadATextFile(txt, name) {
  const textBlob = new Blob([txt], { type: 'text/plain' }),
    tempURL = URL.createObjectURL(textBlob);
  downloadADataURL(tempURL, name);
  URL.revokeObjectURL(tempURL);
}

// saveDiagramAsSVG: take the current state of 'sankey_svg' and relay
// it nicely to the user
glob.saveDiagramAsSVG = () => {
  // Make a copy of the true SVG & make a few cosmetic changes:
  const svgForExport
  = el('sankey_svg').outerHTML
    // Take out the id and the class declaration for the background:
    .replace(' id="sankey_svg"', '')
    .replace(/ class="svg_background_[a-z]+"/, '')
    // Add a title placeholder & credit comment after the FIRST tag:
    .replace(
      />/,
      '>\r\n<title>Your Diagram Title</title>\r\n'
          + `<!-- Generated with SankeyMATIC: ${glob.humanTimestamp()} -->\r\n`
      )
    // Add some line breaks to highlight where [g]roups start/end
    // and where each path/text/rect begins:
    .replace(/><(g|\/g|path|text|rect)/g, '>\r\n<$1');
  downloadATextFile(svgForExport, `sankeymatic_${glob.fileTimestamp()}.svg`);
};

// MARK SVG path specification functions

// flatFlowPathMaker(f):
// Returns an SVG path drawing a parallelogram between 2 nodes.
// Used for the "d" attribute on a "path" element when curvature = 0 OR
// when there is no curve to usefully draw (i.e. the flow is ~horizontal).
function flatFlowPathMaker(f) {
  const sx = f.source.x + f.source.dx, // source's trailing edge
    tx = f.target.x,                   // target's leading edge
    syTop = f.source.y + f.sy,         // source flow top
    tyBot = f.target.y + f.ty + f.dy;  // target flow bottom

  f.renderAs = 'flat'; // Render this path as a filled parallelogram

  // This SVG Path spec means:
  // [M]ove to the flow source's top; draw a [v]ertical line down,
  // a [L]ine to the opposite corner, a [v]ertical line up,
  // then [z] close.
  return `M${ep(sx)} ${ep(syTop)}v${ep(f.dy)}`
    + `L${ep(tx)} ${ep(tyBot)}v${ep(-f.dy)}z`;
}

// curvedFlowPathFunction(curvature):
// Returns an SVG-path-producing /function/ based on the given curvature.
// Used for the "d" attribute on a "path" element when curvature > 0.
// Defers to flatFlowPathMaker() when the flow is basically horizontal.
function curvedFlowPathFunction(curvature) {
  return (f) => {
    const syC = f.source.y + f.sy + f.dy / 2, // source flow's y center
      tyC = f.target.y + f.ty + f.dy / 2,     // target flow's y center
      sEnd = f.source.x + f.source.dx,  // source's trailing edge
      tStart = f.target.x;              // target's leading edge

    // Watch out for a nearly-straight path (total rise/fall < 2 pixels OR
    // very little horizontal space to work with).
    // If we have one, make this flow a simple 4-sided shape instead of
    // a curve. (This avoids weird artifacts in some SVG renderers.)
    if (Math.abs(syC - tyC) < 2 || Math.abs(tStart - sEnd) < 12) {
      return flatFlowPathMaker(f);
    }

    f.renderAs = 'curved'; // Render this path as a curved stroke

    // Make the curved path:
    // Set up a function for interpolating between the two x values:
    const xinterpolate = d3.interpolateNumber(sEnd, tStart),
      // Pick 2 curve control points given the curvature & its converse:
      xcp1 = xinterpolate(curvature),
      xcp2 = xinterpolate(1 - curvature);
    // This SVG Path spec means:
    // [M]ove to the center of the flow's start [sx,syC]
    // Draw a Bezier [C]urve using control points [xcp1,syC] & [xcp2,tyC]
    // End at the center of the flow's target [tx,tyC]
    return (
      `M${ep(sEnd)} ${ep(syC)}C${ep(xcp1)} ${ep(syC)} `
        + `${ep(xcp2)} ${ep(tyC)} ${ep(tStart)} ${ep(tyC)}`
    );
  };
}

// MARK Validation of Settings

// settingIsValid(metadata, human value, size object {w: _, h: _}):
// return [true, computer value] IF the given value meets the criteria.
// Note: The 'size' object is only used when validating 'contained' settings.
function settingIsValid(sData, hVal, cfg) {
  const [dataType, defaultVal, allowList] = sData;

  // Checkboxes: Translate y/n/Y/N/Yes/No to true/false.
  if (dataType === 'yn' && reYesNo.test(hVal)) {
    return [true, reYes.test(hVal)];
  }

  if (['radio', 'list'].includes(dataType)
      && allowList.includes(hVal)) {
    return [true, hVal];
  }

  if (dataType === 'color') {
    let rgb;
    if (reRGBColor.test(hVal)) {
      rgb = d3.rgb(hVal);
    } else if (reBareColor.test(hVal)) {
      rgb = d3.rgb(`#${hVal}`);
    } else { // maybe it's a CSS name like blue/green/lime/maroon/etc.?
      const namedRGB = d3.color(hVal);
      if (namedRGB) { rgb = namedRGB; }
    }
    // If we found a real color spec, return the full 6-char html value.
    // (This fixes the problem of a 3-character color like #789.)
    if (rgb) { return [true, rgb.formatHex()]; }
  }

  // Support gradient format (two color values separated by comma)
  if (dataType === 'gradient') {
    console.log('Processing gradient:', hVal, 'type:', typeof hVal);
    if (!hVal || typeof hVal !== 'string' || hVal === 'NaN' || hVal === '0') {
      console.log('Invalid gradient value:', hVal);
      return [true, '']; // Return empty string for invalid/missing gradient
    }
    // Remove single quotes and split
    const colors = hVal.replace(/'/g, '').split(',');
    console.log('Gradient colors:', colors);
    if (colors.length === 2) {
      let validColors = true;
      const processedColors = colors.map(c => {
        let rgb;
        c = c.trim();
        if (reRGBColor.test(c)) {
          rgb = d3.rgb(c);
        } else if (reBareColor.test(c)) {
          rgb = d3.rgb(`#${c}`);
        } else {
          const namedRGB = d3.color(c);
          if (namedRGB) { rgb = namedRGB; }
        }
        if (!rgb) {
          validColors = false;
        }
        return rgb ? rgb.formatHex() : null;
      });
      console.log('Processed colors:', processedColors, 'Valid:', validColors);
      if (validColors) {
        return [true, processedColors.join(',')];
      }
    }
    // 如果渐变格式无效，返回原值以便调试
    console.log('Gradient validation failed, returning original value');
    return [true, hVal];
  }

  // valueInBounds: Verify a numeric value is in a range.
  // 'max' can be undefined, which is treated as 'no maximum'
  function valueInBounds(v, [min, max]) {
    return v >= min && (max === undefined || v <= max);
  }

  if (dataType === 'text') {
    // UN-double any single quotes:
    const unescapedVal = hVal.replaceAll("''", "'");
    // Make sure the string's length is in the right range:
    if (valueInBounds(unescapedVal.length, allowList)) {
      return [true, unescapedVal];
    }
  }

  // The only types remaining are numbers:
  const valAsNum = Number(hVal);
  if (dataType === 'decimal'
      && reDecimal.test(hVal)
      && valueInBounds(valAsNum, [0, 1.0])) {
    return [true, valAsNum];
  }
  if (dataType === 'integer'
      && reInteger.test(hVal)
      && valueInBounds(valAsNum, allowList)) {
    return [true, valAsNum];
  }
  if (dataType === 'half'
      && reHalfNumber.test(hVal)
      && valueInBounds(valAsNum, allowList)) {
    return [true, valAsNum];
  }
  if (['whole', 'contained', 'breakpoint'].includes(dataType)
      && reWholeNumber.test(hVal)) {
    let [minV, maxV] = [0, 0];
    switch (dataType) {
      case 'whole': [minV, maxV] = allowList; break;
      // Dynamic values (like margins) should be processed after the
      // diagram's size is set so that we can compare them to their
      // specific containing dimension (that's why they appear later
      // in the settings list):
      case 'contained': maxV = cfg[allowList[1]]; break;
      // breakpoints: We can't just use the current 'never' value
      // for comparison, since we may be importing a new diagram with
      // a different number of stages:
      case 'breakpoint': maxV = defaultVal; break;
      // no default
    }
    if (valueInBounds(valAsNum, [minV, maxV])) {
      return [true, valAsNum];
    }
  }
  // If we could not affirmatively say this value is good:
  return [false];
}

// setValueOnPage(name, type, computer-friendly value):
// Given a valid value, update the field on the page to adopt it:
function setValueOnPage(sName, dataType, cVal) {
  // console.log(sName, dataType, cVal);

  // 对于没有对应DOM元素的配置（如API专用配置），跳过DOM更新
  const element = el(sName);
  if (!element) {
    // 这些配置可能是API专用的，不需要DOM元素
    return;
  }

  switch (dataType) {
    case 'radio': radioRef(sName).value = cVal; break;
    // cVal is expected to be boolean at this point for checkboxes:
    case 'yn': element.checked = cVal; break;
    // All remaining types (color, list, text, whole/decimal/etc.):
    default: element.value = cVal;
  }
}

// getHumanValueFromPage(name, type):
// Look up a particular setting and return the appropriate human-friendly value
function getHumanValueFromPage(fName, dataType) {
  switch (dataType) {
    case 'radio': return radioRef(fName).value;
    case 'color': return el(fName).value.toLowerCase();
    // translate true/false BACK to Y/N in this case:
    case 'yn': return el(fName)?.checked ? 'Y' : 'N';
    case 'list':
    case 'text':
      return el(fName).value;
    // All remaining types are numeric:
    default: return Number(el(fName).value);
  }
}

// Take a human-friendly setting and make it JS-friendly:
function settingHtoC(hVal, dataType) {
  switch (dataType) {
    case 'whole':
    case 'half':
    case 'decimal':
    case 'integer':
    case 'contained':
    case 'breakpoint':
      return Number(hVal);
    case 'yn': return reYes.test(hVal);
    default: return hVal;
  }
}

// MARK Message Display

// Show a value quoted & bolded & HTML-escaped:
function highlightSafeValue(userV) {
  return `&quot;<strong>${escapeHTML(userV)}</strong>&quot;`;
}

// Isolated logic for managing messages to the user:
const msg = {
  areas: new Map([
    ['issue', { id: 'issue_messages', class: 'errormessage' }],
    ['difference', { id: 'imbalance_messages', class: 'differencemessage' }],
    ['total', { id: 'totals_area_bottom', class: '' }], // 修改为新的底部统计区域
    ['info', { id: 'info_messages', class: 'okmessage' }],
    ['console', { id: 'console_lines', class: '' }],
  ]),
  add: (msgHTML, msgArea = 'info') => {
    const msgData = msg.areas.get(msgArea) || msg.areas.get('info'),
      msgDiv = document.createElement('div');

    if (!msgData) {
      console.error('Message area not found:', msgArea);
      return;
    }

    const container = el(msgData.id);
    if (!container) {
      console.error('Message container not found:', msgData.id);
      return;
    }

    msgDiv.innerHTML = msgHTML;
    if (msgData.class.length) { msgDiv.classList.add(msgData.class); }

    container.appendChild(msgDiv);
  },
  consoleContainer: el('console_area'),
  log: (msgHTML) => {
    // Reveal the console if it's hidden:
    msg.consoleContainer.style.display = '';
    msg.add(msgHTML, 'console');
  },
  flagsSeen: new Set(),
  logOnce: (flag, msgHTML) => {
    if (msg.flagsSeen.has(flag)) { return; }
    msg.log(`<span class="info_text">${msgHTML}</span>`);
    msg.flagsSeen.add(flag);
  },
  queue: [],
  addToQueue: (msgHTML, msgArea) => { msg.queue.push([msgHTML, msgArea]); },
  // Clear out any old messages:
  resetAll: () => {
    Array.from(msg.areas.values())
      .map((a) => a.id)
      .forEach((id) => {
        const element = el(id);
        if (element) {
          // 使用更兼容的方式清空元素内容
          while (element.firstChild) {
            element.removeChild(element.firstChild);
          }
        }
      });

    // 同时清空原来的totals_area以避免重复显示
    const originalTotalsArea = el('totals_area');
    if (originalTotalsArea) {
      while (originalTotalsArea.firstChild) {
        originalTotalsArea.removeChild(originalTotalsArea.firstChild);
      }
    }

    if (msg.consoleContainer) {
      msg.consoleContainer.style.display = 'none';
    }
    msg.flagsSeen.clear();
  },
  // If any pending messages have been queued, show them:
  showQueued: () => {
    while (msg.queue.length) { msg.add(...msg.queue.shift()); }
  },
};

// MARK Loading Sample Graphs

// hideReplaceGraphWarning: Called directly from the page (and from below)
// Dismiss the note about overwriting the user's current inputs.
glob.hideReplaceGraphWarning = () => {
  // Hide the overwrite-warning paragraph (if it's showing)
  el('replace_graph_warning').style.display = 'none';
  return null;
};

// replaceGraphConfirmed: Called directly from the page (and from below).
// It's ok to overwrite the user's inputs now. Let's go.
// (Note: In order to reach this code, we have to have already verified the
// presence of the named recipe, so we don't re-verify.)
glob.replaceGraphConfirmed = () => {
  const graphName = elV('demo_graph_chosen'),
    savedRecipe = sampleDiagramRecipes.get(graphName);

  // Update any settings which accompanied the stored diagram:
  // In case the new breakpoint > the prior max, reset those now:
  glob.resetMaxBreakpoint(MAXBREAKPOINT);
  Object.entries(savedRecipe.settings).forEach(([fld, newVal]) => {
    const fldData = skmSettings.get(fld),
      [validSetting, finalValue] = settingIsValid(fldData, newVal, {});
    if (validSetting) { setValueOnPage(fld, fldData[0], finalValue); }
  });

  // First, verify that the flow input field is visible.
  // (If it's been hidden, the setting of flows won't work properly.)
  const flowsPanel = 'input_options';
  if (el(flowsPanel).style.display === 'none') {
    glob.togglePanel(flowsPanel);
  }

  // Then select all the existing input text...
  const flowsEl = el(userInputsField);
  flowsEl.focus();
  flowsEl.select();
  // ... then replace it with the new content.
  flowsEl.setRangeText(savedRecipe.flows, 0, flowsEl.selectionEnd, 'start');

  // Un-focus the input field (on tablets, this keeps the keyboard from
  // auto-popping-up):
  flowsEl.blur();

  // If the replace-graph warning is showing, hide it:
  glob.hideReplaceGraphWarning();

  // Take away any remembered moves (just in case any share a name with a
  // node in the new diagram) & immediately draw the new diagram::
  glob.resetMovesAndRender();
  return null;
};

// replaceGraph: Called directly from the page.
// User clicked a button which may cause their work to be erased.
// Run some checks before we commit...
glob.replaceGraph = (graphName) => {
  // Is there a recipe with the given key? If not, exit early:
  const savedRecipe = sampleDiagramRecipes.get(graphName);
  if (!savedRecipe) {
    // (This shouldn't happen unless the user is messing around in the DOM)
    msg.add(
      `Requested sample diagram ${highlightSafeValue(graphName)} not found.`,
      'issue'
    );
    return null;
  }

  // Set the 'demo_graph_chosen' value according to the user's click:
  el('demo_graph_chosen').value = graphName;

  // When it's easy to revert to the user's current set of inputs, we don't
  // bother asking to confirm. This happens in two scenarios:
  // 1) the inputs are empty, or
  // 2) the user is looking at inputs which exactly match any of the sample
  // diagrams.
  const userInputs = elV(userInputsField),
    inputsMatchAnySample = Array.from(sampleDiagramRecipes.values())
      .some((r) => r.flows === userInputs);

  if (inputsMatchAnySample || userInputs === '') {
    // The user has NOT changed the input from one of the samples,
    // or the whole field is blank. Go ahead with the change:
    glob.replaceGraphConfirmed();
  } else {
    // Show the warning and do NOT replace the graph:
    el('replace_graph_warning').style.display = '';
    el('replace_graph_yes').textContent
      = `Yes, replace the graph with '${savedRecipe.name}'`;
  }

  return null;
};

// MARK Color Theme handling

// colorThemes: The available color arrays to assign to Nodes.
const colorThemes = new Map([
  ['a', {
    colorset: d3.schemeCategory10,
    nickname: 'Categories',
    d3Name: 'Category10',
  }],
  ['b', {
    colorset: d3.schemeTableau10,
    nickname: 'Tableau10',
    d3Name: 'Tableau10',
  }],
  ['c', {
    colorset: d3.schemeDark2,
    nickname: 'Dark',
    d3Name: 'Dark2',
  }],
  ['d', {
    colorset: d3.schemeSet3,
    nickname: 'Varied',
    d3Name: 'Set3',
  }],
]);

function approvedColorTheme(themeKey) {
  // Give back an empty theme if the key isn't valid:
  return colorThemes.get(themeKey.toLowerCase())
    || { colorset: [], nickname: 'Invalid Theme', d3Name: '?' };
}

// rotateColors: Return a copy of a color array, rotated by the offset:
function rotateColors(colors, offset) {
  const goodOffset = clamp(offset, 0, colors.length);
  return colors.slice(goodOffset).concat(colors.slice(0, goodOffset));
}

// We have to construct this fieldname in a few places:
function offsetField(key) { return `themeoffset_${key}`; }

// nudgeColorTheme: Called directly from the page.
// User just clicked an arrow on a color theme.
// Rotate the theme colors & re-display the diagram with the new set.
glob.nudgeColorTheme = (themeKey, move) => {
  const themeOffsetEl = el(offsetField(themeKey)),
    currentOffset = (themeOffsetEl === null) ? 0 : themeOffsetEl.value,
    colorsInTheme = approvedColorTheme(themeKey).colorset.length,
    newOffset = (colorsInTheme + +currentOffset + +move) % colorsInTheme;

  // Update the stored offset with the new value (0 .. last color):
  themeOffsetEl.value = newOffset;

  // If the theme the user is updating is not the active one, switch to it:
  el(`theme_${themeKey}_radio`).checked = true;

  glob.process_sankey();
  return null;
};

// render_sankey: given nodes, flows, and other config, MAKE THE SVG DIAGRAM:
function render_sankey(allNodes, allFlows, cfg, numberStyle) {
  console.log('Rendering sankey diagram with:', {
    nodes: allNodes.length,
    flows: allFlows.length,
    config: cfg
  });

  // Set up functions and measurements we will need:
  const svgEl = el('sankey_svg');
  if (!svgEl) {
    console.error('SVG element not found');
    return;
  }

  const chartEl = el('chart');
  if (!chartEl) {
    console.error('Chart container not found');
    return;
  }

  console.log('Found required elements:', {
    svg: svgEl,
    chart: chartEl
  });

  svgEl.setAttribute('height', cfg.size_h);
  svgEl.setAttribute('width', cfg.size_w);
  svgEl.setAttribute(
    'class',
    `svg_background_${cfg.bg_transparent ? 'transparent' : 'default'}`
  );
  svgEl.innerHTML = ''; // 使用innerHTML替代textContent以确保完全清空

  // withUnits: Format a value with the current style.
  function withUnits(n) { return formatUserData(n, numberStyle); }

  // To measure text sizes, first we make a dummy SVG area the user won't
  // see, with the same size and font details as the real diagram:
  const scratchRoot = d3.select('#svg_scratch')
    .attr('height', cfg.size_h)
    .attr('width', cfg.size_w)
    .attr('text-anchor', 'middle')
    .attr('opacity', '0') // Keep all this invisible...
    .attr('font-family', cfg.labels_fontface)
    .attr('font-size', `${ep(cfg.labelname_size)}px`);
  scratchRoot.selectAll('*').remove(); // Clear out any past items

  /**
   * @typedef {(100|400|700)} fontWeight
   *
   * All the data needed to render a text span:
   * @typedef {Object} textFragment
   * @property {string} txt
   * @property {number} size - font size
   * @property {fontWeight} weight
   * @property {boolean} newLine - Should there be a line break
   *    preceding this item?
   */

  /**
   * Add <tspan> elements to an existing SVG <text> node.
   * Put line breaks of reasonable size between them if needed.
   *
   * ISSUE (rare, minor): If a later line has a larger font size which occurs
   *   *after* its first span, we don't catch that here. So the line spacing
   *   *can* look too small in that case.  However, spacing that according to
   *   the biggest size can also look awkward. Leaving this as-is for now.
   * @param {*} d3selection
   * @param {textFragment[]} textObjs
   * @param {number} origSize - the size of the text item we are appending to
   * @param {number} origX - the text item's original X coordinate
   */
  function addTSpans(d3selection, textObjs, origSize, origX) {
    let prevLineMaxSize = origSize;
    textObjs.forEach((tspan) => {
      // Each span may or may not want a line break before it:
      if (tspan.newLine) {
        // Set up a reasonable spacing given the prior line's maximum font size
        // compared to the new line's:
        const lineSpacing
          = (0.95 + cfg.labels_linespacing)
            * ((prevLineMaxSize + tspan.size * 3) / 4);
        d3selection.append('tspan')
          .attr('x', ep(origX))
          .attr('dy', ep(lineSpacing))
          .attr('font-weight', tspan.weight)
          .attr('font-size', `${ep(tspan.size)}px`)
          .text(tspan.txt);
        prevLineMaxSize = tspan.size; // reset to the new line's initial size
      } else {
        // No new line; just add the new piece in series:
        d3selection.append('tspan')
          .attr('font-weight', tspan.weight)
          .attr('font-size', `${ep(tspan.size)}px`)
          .text(tspan.txt);
        prevLineMaxSize = Math.max(prevLineMaxSize, tspan.size);
      }
    });
  }

  /**
   * @typedef {Object} SVGDimensions
   * @property {number} w - width
   * @property {number} h - height
   * @property {number} line1h - height of the entire first displayed line of text
   */

  /**
   * Set up and measure an SVG <text> element, placed at the hidden canvas'
   * midpoint. The text element may be assembled from multiple spans.
   * @param {textFragment[]} txtList
   * @param {string} id
   * @returns {SVGDimensions} dimensions - width, height, and line 1's height
   */
  function measureSVGText(txtList, id) {
    const firstEl = txtList[0],
      laterSpans = txtList.slice(1),
      firstNewLineIndex = laterSpans.findIndex((tspan) => tspan.newLine),
      line1Weight = firstEl.weight ?? cfg.labelname_weight;

    // A bit of complicated measuring to deal with here.
    // Note: Either list here may be empty!
    /** @type {textFragment[]} */
    let line1Suffixes = [],
      laterLines = [],
      /** @type {number} */
      line1Size = firstEl.size ?? cfg.labelname_size;
    if (firstNewLineIndex === -1) { // No newlines, only suffixes
      line1Suffixes = laterSpans;
    } else { // firstNewLineIndex >= 0
      line1Suffixes = laterSpans.slice(0, firstNewLineIndex);
      laterLines = laterSpans.slice(firstNewLineIndex);
    }

    // Set up the first element:
    const txtId = `bb_${id}`, // (bb for 'BoundingBox')
      [xC, yC] = [cfg.size_w / 2, cfg.size_h / 2], // centers
      textEl = scratchRoot
        .append('text')
        .attr('id', txtId)
        .attr('x', ep(xC))
        .attr('y', ep(yC))
        .attr('font-weight', line1Weight)
        .attr('font-size', `${ep(line1Size)}px`)
        .text(firstEl.txt);

    // Add any remaining line1 pieces so we can know line 1's real height:
    if (line1Suffixes.length) {
      addTSpans(textEl, line1Suffixes, line1Size, xC);
      // Update line1Size IF any suffixes were larger:
      line1Size = Math.max(line1Size, ...line1Suffixes.map((s) => s.size));
    }
    // Measure this height before we add more lines:
    const line1height = textEl.node().getBBox().height;

    if (laterLines.length) { addTSpans(textEl, laterLines, line1Size, xC); }
    const totalBB = textEl.node().getBBox(); // size after all pieces are added

    return {
      h: totalBB.height,
      w: totalBB.width,
      line1h: line1height,
    };
  }

  // setUpTextDimensions():
  //   Compute padding values for label highlights, etc.
  function setUpTextDimensions() {
    // isFirefox(): checks for Firefox-ness of the browser.
    // Why? Because we have to adjust SVG font spacing for Firefox's
    // sake.
    // It would be better if SVG-font-sizing differences were detectable
    // directly, but so far I haven't figured out how to test for just
    // that, so we check for Firefox. (Many use 'InstallTrigger' to
    // check for FF, but that's been deprecated.)
    function isFirefox() {
      return navigator
        && /firefox/i.test(
          navigator.userAgent || navigator.vendor || ''
        );
    }

    // First, how big are an em and an ex in the current font, roughly?
    const emSize = measureSVGText([{ txt: 'm' }], 'em'),
      boundingBoxH = emSize.h, // (same for all characters)
      emW = emSize.w,
      // The WIDTH of an 'x' is a crude estimate of the x-HEIGHT, but
      // it's what we have for now:
      exH = measureSVGText([{ txt: 'x' }], 'ex').w,
      // Firefox has unique SVG measurements in 2022, so we look for it:
      browserKey = isFirefox() ? 'firefox' : '*',
      metrics
        = fontMetrics[browserKey][cfg.labels_fontface]
          || fontMetrics[browserKey]['*'],
      m = {
        dy: metrics.dy * boundingBoxH,
        top: metrics.top * exH,
        bot: metrics.bot * exH,
        inner: metrics.inner * emW,
        outer: metrics.outer * emW,
        dyFactor: metrics.dy,
        };
    // Compute the remaining values (which depend on values above).
    // lblMarginAfter = total margin to give a label when it is after a node
    //   (Note: this value basically includes m.inner)
    // lblMarginBefore = total margin when label is before a node

    // 使用固定的标签距离值（优化后的设置）
    // 这样可以确保标签与节点的距离一致且合适
    m.lblMarginAfter = 10;   // 右侧标签固定距离10像素
    m.lblMarginBefore = 10;  // 左侧标签固定距离10像素
    return m;
  }

  const pad = setUpTextDimensions(),
    // Create the sankey object & the properties needed for the skeleton.
    // NOTE: The call to d3.sankey().setup() will MODIFY the allNodes and
    // allFlows objects -- filling in specifics about connections, stages,
    // etc.
    sankeyObj = d3.sankey()
      .nodes(allNodes)
      .flows(allFlows)
      .rightJustifyEndpoints(cfg.layout_justifyends)
      .leftJustifyOrigins(cfg.layout_justifyorigins)
      .setup();

  // After the .setup() step, Nodes are divided up into Stages.
  // stagesArr = each Stage in the diagram (and the Nodes inside them)
  let stagesArr = sankeyObj.stages();
  // Update the label breakpoint controls based on the # of stages.
  // We need a value meaning 'never'; that's 1 past the (1-based) end of the
  // array, so: length + 1
  const newMax = stagesArr.length + 1,
    oldMax = glob.labelNeverBreakpoint;
  // Has the 'never' value changed?
  if (newMax !== oldMax) {
    // Update the slider's range with the new maximum:
    glob.resetMaxBreakpoint(newMax);
    // If the stage count has become lower than the breakpoint value, OR
    // if the stage count has increased but the old 'never' value was chosen,
    // we also need to adjust the slider's value to be the new 'never' value:
    if (cfg.labelposition_breakpoint > newMax
      || cfg.labelposition_breakpoint === oldMax) {
      el(breakpointField).value = newMax;
      cfg.labelposition_breakpoint = newMax;
    }
  }

  // MARK Shadow logic

  // shadowFilter(i): true/false value indicating whether to display an item.
  // Normally shadows are hidden, but the revealshadows flag can override.
  // i can be either a node or a flow.
  function shadowFilter(i) {
    return !i.isAShadow || cfg.internal_revealshadows;
  }

  if (cfg.internal_revealshadows) {
    // Add a usable tipname since they'll be used (i.e. avoid 'undefined'):
    allNodes
      .filter((n) => n.isAShadow)
      .forEach((n) => { n.tipname = '(shadow)'; });
  }
  // MARK Label-measuring time
  // Depending on where labels are meant to be placed, we measure their
  // sizes and calculate how much room has to be reserved for them (and
  // subtracted from the graph area):

  /**
   * Given a Node, list all the label pieces we'll need to display.
   * Also, scale their sizes according to the user's instructions.
   * @param {object} n - Node we are making the label for
   * @param {number} magnification - amount to scale this entire label
   * @returns {textFragment[]} List of text items
   */
  function getLabelPieces(n, magnification) {
    const overallSize = cfg.labelname_size * magnification,
      // The relative-size values 50 to 150 become -.5 to .5:
      relativeSizeAdjustment = (cfg.labels_relativesize - 100) / 100,
      nameSize = overallSize * (1 - relativeSizeAdjustment),
      valueSize = overallSize * (1 + relativeSizeAdjustment),
      changeSize = overallSize * (1 + relativeSizeAdjustment * 0.8), // Slightly smaller than value
      nameParts = String(n.name).split('\\n'), // Use \n for multiline labels
      nameObjs = nameParts.map((part, i) => ({
        txt: part,
        weight: cfg.labelname_weight,
        size: nameSize,
        newLine: i > 0
          || (cfg.labelvalue_appears && cfg.labelvalue_position === 'above'),
      })),
      valObj = {
        txt: withUnits(n.value),
        weight: cfg.labelvalue_weight,
        size: valueSize,
        newLine: (cfg.labelname_appears && cfg.labelvalue_position === 'below'),
      };

    // Calculate and format changes if enabled and previous value exists
    let changeObj = null;
    if (cfg.labelchange_appears && n.previousValue !== undefined && n.previousValue !== null) {
      const currentValue = parseFloat(n.value) || 0;
      const previousValue = parseFloat(n.previousValue) || 0;
      let changePercent = 0;
      let changeText = '';

      if (previousValue !== 0) {
        changePercent = ((currentValue - previousValue) / previousValue) * 100;
        const sign = changePercent >= 0 ? '+' : '';
        const suffix = cfg.labelchange_suffix ? ` ${cfg.labelchange_suffix}` : '';
        changeText = `${sign}${changePercent.toFixed(1)}%${suffix}`;
      } else if (currentValue !== 0) {
        // Handle case where previous value was 0 but current is not
        const suffix = cfg.labelchange_suffix ? ` ${cfg.labelchange_suffix}` : '';
        changeText = `+∞%${suffix}`;
      } else {
        // Both values are 0
        const suffix = cfg.labelchange_suffix ? ` ${cfg.labelchange_suffix}` : '';
        changeText = `0%${suffix}`;
      }

      changeObj = {
        txt: changeText,
        weight: cfg.labelchange_weight,
        size: changeSize,
        newLine: true, // Changes always appear on a new line
      };
    }

    // Build the result array based on what should be displayed
    const result = [];

    if (!cfg.labelname_appears && !cfg.labelvalue_appears && !cfg.labelchange_appears) {
      return [];
    }

    if (!cfg.labelname_appears && !cfg.labelvalue_appears) {
      return changeObj ? [changeObj] : [];
    }

    if (!cfg.labelname_appears && !cfg.labelchange_appears) {
      return [valObj];
    }

    if (!cfg.labelvalue_appears && !cfg.labelchange_appears) {
      return nameObjs;
    }

    if (!cfg.labelname_appears) {
      result.push(valObj);
      if (changeObj) result.push(changeObj);
      return result;
    }

    if (!cfg.labelvalue_appears) {
      result.push(...nameObjs);
      if (changeObj) result.push(changeObj);
      return result;
    }

    // All three types can be displayed, arrange according to value position
    switch (cfg.labelvalue_position) {
      case 'before': // separate the value from the name with 1 space
        valObj.txt += ' '; // FALLS THROUGH to 'above'
      case 'above':
        result.push(valObj, ...nameObjs);
        if (changeObj) result.push(changeObj);
        return result;
      case 'after': // Add a colon just before the value
        nameObjs[nameObjs.length - 1].txt += ': '; // FALLS THROUGH
      default: // 'below'
        result.push(...nameObjs, valObj);
        if (changeObj) result.push(changeObj);
        return result;
    }
  }

  /**
   * @typedef {('start'|'middle'|'end')} SVGAnchorString
   */

  /**
   * Derives the SVG anchor string for a label based on the diagram's
   * labelposition_scheme (which can be 'per_stage' or 'auto').
   * @param {object} n - a Node object.
   * @returns {SVGAnchorString}
   */
  function labelAnchor(n) {
    if (cfg.labelposition_scheme === 'per_stage') {
      const bp = cfg.labelposition_breakpoint - 1,
        anchorAtEnd
          = cfg.labelposition_first === 'before' ? n.stage < bp : n.stage >= bp;
      return anchorAtEnd ? 'end' : 'start';
    }
    // Scheme = 'auto' here. Put the label on the empty side if there is one.
    // We check the *count* of flows in/out, because their sum might be 0:
    if (!n.flows[IN].length) { return 'end'; }
    if (!n.flows[OUT].length) { return 'start'; }
    switch (cfg.labelposition_autoalign) {
      case -1: return 'end';
      case 1: return 'start';
      default: return 'middle';
    }
  }

  // Make a function to easily find a value's place in the overall range of
  // Node sizes:
  const [minVal, maxVal] = d3.extent(allNodes, (n) => n.value),
    nodeScaleFn // returns a Number from 0 to 1:
      = (v) => (minVal === maxVal ? 1 : (v - minVal) / (maxVal - minVal));

  // Set up label information for each Node:
  if (cfg.labelname_appears || cfg.labelvalue_appears) {
    allNodes.filter(shadowFilter)
      .filter((n) => !n.hideLabel)
      .forEach((n) => {
        const totalRange = (Math.abs(cfg.labels_magnify - 100) * 2) / 100,
          nFactor = nodeScaleFn(n.value),
          nAbsolutePos = cfg.labels_magnify >= 100 ? nFactor : 1 - nFactor,
          // Locate this value in the overall range of sizes, then
          // scoot that range to be centered on 0:
          nodePositionInRange = nAbsolutePos * totalRange - totalRange / 2,
          magnifyLabel
            = cfg.labels_magnify === 100 ? 1 : 1 + nodePositionInRange,
          id = `label${n.index}`; // label0, label1..
        n.labelList = getLabelPieces(n, magnifyLabel);
        n.label = {
          dom_id: id,
          anchor: labelAnchor(n),
          bb: measureSVGText(n.labelList, id),
        };
      });
  }

  // maxLabelWidth(stageArr, labelsBefore):
  //   Compute the total space required by the widest label in a stage
  function maxLabelWidth(stageArr, labelsBefore) {
    let maxWidth = 0;
    stageArr.filter((n) => n.labelList?.length)
      .forEach((n) => {
        const labelTotalW
          = n.label.bb.w
            + (labelsBefore ? pad.lblMarginBefore : pad.lblMarginAfter)
            + pad.outer;
        maxWidth = Math.max(maxWidth, labelTotalW);
      });
    return maxWidth;
  }

  // setUpDiagramSize(): Compute the final size of the graph
  function setUpDiagramSize() {
    // Calculate the actual room we have to draw in...
    // Start from the user's declared canvas size + margins:
    const graphW = cfg.size_w - cfg.margin_l - cfg.margin_r,
      graphH = cfg.size_h - cfg.margin_t - cfg.margin_b,
      lastStage = stagesArr.length - 1,
      labelsBeforeFirst
        = stagesArr[0].filter((n) => n.label?.anchor === 'end'),
      labelsAfterLast
        = stagesArr[lastStage].filter((n) => n.label?.anchor === 'start'),
      // If any labels are BEFORE stage 0, get its maxLabelWidth:
      leadingW
        = labelsBeforeFirst.length > 0
          ? maxLabelWidth(stagesArr[0], true)
          : Math.max(cfg.margin_l / 2, cfg.node_border / 2),
      // If any labels are AFTER the last stage, get its maxLabelWidth:
      trailingW
        = labelsAfterLast.length > 0
          ? maxLabelWidth(stagesArr[lastStage], false)
          : Math.max(cfg.margin_r / 2, cfg.node_border / 2),
      // Compute the ideal width to fit everything successfully:
      idealW = graphW - leadingW - trailingW,
      // Find the smallest width we will allow -- all the Node widths
      // plus (5px + node_border) for every Flow region:
      minimumW
        = (stagesArr.length * cfg.node_w)
          + (lastStage * (cfg.node_border + 5)),
      // Pick which width we will actually use:
      finalW = Math.max(idealW, minimumW),
      // Is any part of the diagram going to be cut off?
      // If so, we have to decide how to distribute the bad news.
      //
      // This derives the proportion of any potential cut-off area
      // which shall be attributed to the leading side:
      leadingShareOfError
        = leadingW + trailingW > 0
          ? (leadingW / (leadingW + trailingW))
          : 0.5,
      // The actual amount of error (if any) for the leading side:
      leadingCutOffAdjustment
        = idealW < minimumW
          ? (idealW - minimumW) * leadingShareOfError
          : 0;
    return {
      w: finalW,
      h: graphH,
      final_margin_l: cfg.margin_l + leadingW + leadingCutOffAdjustment,
    };
  }

  const graph = setUpDiagramSize();

  // Ready for final layout!
  // We have the skeleton set up; add the remaining dimension values.
  // (Note: This call further ALTERS allNodes & allFlows with their
  // specific coordinates.)
  sankeyObj.size({ w: graph.w, h: graph.h })
    .nodeWidth(cfg.node_w)
    .nodeHeightFactor(cfg.node_h / 100)
    .nodeSpacingFactor(cfg.node_spacing / 100)
    .autoLayout(cfg.layout_order === 'automatic')
    .attachIncompletesTo(cfg.layout_attachincompletesto)
    .layout(cfg.internal_iterations); // Note: The 'layout()' step must be LAST

  // We *update* the final stages array here, because in theory it may
  // have been changed. The final array will be used for some layout
  // questions (like where labels will land inside the diagram, or for
  // the 'outside-in' flow color style):
  stagesArr = sankeyObj.stages();

  // Now that the stages & values are known, we can finish preparing the
  // Node & Flow objects for the SVG-rendering routine.
  const userColorArray
    = cfg.node_theme === 'none'
      ? [cfg.node_color] // (User wants just one color)
      : rotateColors(
          approvedColorTheme(cfg.node_theme).colorset,
          cfg[offsetField(cfg.node_theme)]
        ),
    colorScaleFn = d3.scaleOrdinal(userColorArray),
    // Drawing curves with curvature of <= 0.1 looks bad and produces visual
    // artifacts, so let's just take the lowest value on the slider (0.1)
    // and use that value to mean 0/flat:
    flowsAreFlat = (cfg.flow_curvature <= 0.1),
    // flowPathFn is a function producing an SVG path; the same function is
    // used for all Flows. (Flat flows use a simpler function.)
    flowPathFn = flowsAreFlat
      ? flatFlowPathMaker
      : curvedFlowPathFunction(cfg.flow_curvature),
    // Is the diagram background dark or light?
    darkBg = (cfg.bg_color.toUpperCase() < '#888'),
    // Is the label color more like black or like white?
    darkLabel = (cfg.labels_color.toUpperCase() < '#AAA'),
    // Set up label highlight values:
    hlStyle = highlightStyles[darkLabel ? 'dark' : 'light'];
    hlStyle.orig.fill_opacity = Number(cfg.labels_highlight);
    // Given the user's opacity, calculate a reasonable hover
    // value (2/3 of the distance to 1):
    hlStyle.hover.fill_opacity = 0.666 + Number(cfg.labels_highlight) / 3;

  // stagesMidpoint: Helpful value for deciding if something is in the first
  // or last half of the diagram:
  function stagesMidpoint() { return (stagesArr.length - 1) / 2; }

  // Fill in presentation values for each Node (so the render routine
  // doesn't have to do any thinking):
  allNodes.filter(shadowFilter)
    .forEach((n) => {
    n.dom_id = `r${n.index}`; // r0, r1... ('r' = '<rect>')
    // Everything with this class value will move with the Node when it is
    // dragged:
    n.css_class = `for_${n.dom_id}`; // for_r0, for_r1...
    n.tooltip = `${n.tipname}:\n${withUnits(n.value)}`;
    n.opacity = n.opacity || cfg.node_opacity;

    // Fill in any missing Node colors. (Flows may inherit from these.)
    if (typeof n.color === 'undefined' || n.color === '') {
      // Use the first non-blank portion of a label as the basis for
      // adopting an already-used color or picking a new one.
      // (Note: this is case sensitive!)
      // If there are no non-blank strings in the node name, substitute
      // a word-ish value (rather than crash):
      const colorKeyString
        = (n.tipname?.match(/^\s*(\S+)/) || [null, 'name-is-blank'])[1];
      // Don't use up colors on shadow nodes:
      n.color = n.isAShadow ? colorGray60 : colorScaleFn(colorKeyString);
    }
    // Now that we're guaranteed a color, we can calculate a border shade:
    n.border_color
      = darkBg ? d3.rgb(n.color).brighter(2) : d3.rgb(n.color).darker(2);

    // Set up label presentation values:
    if (n.labelList?.length && !n.hideLabel) {
      // Which side of the node will the label be on?
      switch (n.label.anchor) {
        case 'start': n.label.x = n.x + n.dx + pad.lblMarginAfter; break;
        case 'end': n.label.x = n.x - pad.lblMarginBefore; break;
        default: n.label.x = n.x + n.dx / 2;
      }
      // 直接调整标签的Y位置，让所有标签都往上移更多
      n.label.y = n.y + n.dy / 2 - 8; // 在节点中心基础上向上移动8像素
      // To set the text element's baseline, we have to work with the height
      // of the first text line in the label:
      // 进一步调整dy值以实现更好的垂直居中
      n.label.dy
        = pad.dyFactor * n.label.bb.line1h * (-0.4)  // 进一步增加负值调整幅度
          - (n.label.bb.h - n.label.bb.line1h) / 2;

      // Will there be any highlights? If not, n.label.bg will be null:
      if (hlStyle.orig.fill_opacity > 0) {
        // 增加背景框的边距，让它比标签范围更大
        const extraPadding = 8; // 额外的边距像素
        n.label.bg = {
          dom_id: `${n.label.dom_id}_bg`, // label0_bg, label1_bg..
          offset: {
            x: n.label.anchor === 'end' ? -pad.outer - extraPadding : -pad.inner - extraPadding,
            y: -pad.top - extraPadding,
            w: pad.inner + pad.outer + (extraPadding * 2),
            h: pad.top + pad.bot + (extraPadding * 2),
          },
          ...hlStyle.orig,
        };
      }
    }
  });

  // ...and fill in more Flow details as well:
  allFlows.filter(shadowFilter)
    .forEach((f) => {
    f.dom_id = `flow${f.index}`; // flow0, flow1...
    f.tooltip
      = `${f.source.tipname} → ${f.target.tipname}: ${withUnits(f.value)}`;
    // Fill in any missing opacity values and the 'hover' counterparts:
    f.opacity = f.opacity || cfg.flow_opacity;
    // Hover opacity = halfway between the user's opacity and 1.0:
    f.opacity_on_hover = 0.5 + Number(f.opacity) / 2;

    // Derive any missing Flow colors.
    if (f.color === '') {
      // Stroke Color priority order:
      // 0. If it's a shadow, just color it gray.
      // 1. color given directly to the flow (filtered out above)
      // 2. inheritance-from-node-with-specific-paint-direction
      // 3. default-inheritance-direction OR default flow color
      if (f.isAShadow) {
        f.color = colorGray60;
      } else if (f.source.paint[AFTER]) {
        f.color = f.source.color;
      } else if (f.target.paint[BEFORE]) {
        f.color = f.target.color;
      } else {
        const flowMidpoint = (f.source.stage + f.target.stage) / 2;
        switch (cfg.flow_inheritfrom) {
          case 'source': f.color = f.source.color; break;
          case 'target': f.color = f.target.color; break;
          case 'outside-in':
            // Is the flow's midpoint in the right half, or left?
            // (In the exact middle, we use the source color.)
            f.color = flowMidpoint <= stagesMidpoint()
              ? f.source.color
              : f.target.color;
            break;
          case 'none': f.color = cfg.flow_color;
          // no default
        }
      }
    }
    // Set up alternative values to enable the current flow to be
    // rendered as either flat or curved:
    // When a flow is FLAT:
    //  * It's really a parallelogram, so it needs a 'fill' value.
    //  * We still add a stroke because very angled flows can look too
    //  thin otherwise. (They still can, even with the stroke.)
    // When a flow is CURVED:
    //  * No fill; only stroke-width!
    //  * stroke-width is set to at least 1px so tiny flows can be seen.
    f.fill = { flat: f.color, curved: 'none' };
    f.stroke_width = { flat: 0.5, curved: Math.max(1, f.dy) };
  });

  // At this point, allNodes and allFlows are ready to go. Draw!

  // Clear out any old contents & update the size and class:
  initializeDiagram(cfg);

  // Select the svg canvas:
  const diagramRoot = d3.select('#sankey_svg');

  // If a background color is defined, add a backing rectangle with that color:
  if (!cfg.bg_transparent) {
    // Note: This just adds the rectangle *without* changing the d3
    // selection stored in diagramRoot:
    diagramRoot.append('rect')
      .attr('height', cfg.size_h)
      .attr('width', cfg.size_w)
      .attr('fill', cfg.bg_color);
  }

  // Add title if specified
  if (cfg.diagram_title && cfg.diagram_title.trim() !== '') {
    // 检查是否有渐变色配置
    let titleFill = '#0044FF';
    console.log('Title gradient config:', cfg.title_gradient);

    // 直接检查渐变配置，如果无效则使用默认渐变
    let gradientConfig = cfg.title_gradient;
    if (!gradientConfig || gradientConfig.trim() === '' || gradientConfig === 'NaN' || gradientConfig === '0') {
      // 使用默认渐变
      gradientConfig = '#2F9BFF,#0044FF';
      console.log('Using default gradient:', gradientConfig);
    }

    if (gradientConfig && gradientConfig.includes(',')) {
      // 插入渐变定义
      const gradientId = 'title-gradient';
      const [startColor, endColor] = gradientConfig.split(',');
      diagramRoot.append('defs')
        .append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%')
        .selectAll('stop')
        .data([
          { offset: '0%', color: startColor.trim() },
          { offset: '100%', color: endColor.trim() }
        ])
        .enter()
        .append('stop')
        .attr('offset', d => d.offset)
        .attr('stop-color', d => d.color);
      titleFill = `url(#${gradientId})`;
    }
    diagramRoot.append('text')
      .attr('id', 'diagram_title')
      .attr('x', cfg.size_w / 2)
      .attr('y', cfg.title_size + 10) // Position title near the top with some padding
      .attr('text-anchor', 'middle')
      .attr('font-family', cfg.labels_fontface || 'sans-serif')
      .attr('font-size', `${ep(cfg.title_size)}px`)
      .attr('font-weight', cfg.title_weight)
      .attr('fill', titleFill)
      .text(cfg.diagram_title.trim());
  }

  // Add a [g]roup translating the remaining elements 'inward' by the margins:
  const diagMain
    = diagramRoot.append('g')
      .attr('transform', `translate(${ep(graph.final_margin_l)},${ep(cfg.margin_t)})`);

  // MARK Functions for Flow hover effects
  // applyFlowEffects(flow, opacity, styles):
  //   Update a flow & its related labels based on the hover state:
  function applyFlowEffects(f, o, s) {
    // Use overall 'opacity' because f might use either a fill or stroke:
    d3.select(`#${f.dom_id}`).attr('opacity', o);
    [f.source, f.target].filter((n) => n.label?.bg)
      .forEach((n) => {
        d3.select(`#${n.label.bg.dom_id}`)
          .attr('fill', s.fill)
          .attr('fill-opacity', ep(s.fill_opacity))
          .attr('stroke', s.stroke)
          .attr('stroke-width', ep(s.stroke_width))
          .attr('stroke-opacity', ep(s.stroke_opacity));
    });
  }

  // Hovering over a flow increases its opacity & highlights the labels of
  // the source+target:
  function turnOnFlowHoverEffects(_, f) {
    f.hovering = true;
    applyFlowEffects(f, f.opacity_on_hover, hlStyle.hover);
  }

  // Leaving a flow restores its original appearance:
  function turnOffFlowHoverEffects(_, f) {
    applyFlowEffects(f, f.opacity, hlStyle.orig);
    // don't clear the flag until the job is done:
    f.hovering = false;
  }

  // Set up the [g]roup of rendered flows:
  // diagFlows = the d3 selection of all flow paths:
  const diagFlows = diagMain.append('g')
      .attr('id', 'sankey_flows')
      .selectAll()
      .data(allFlows.filter(shadowFilter))
      .enter()
      .append('path')
      .attr('id', (f) => f.dom_id)
      .attr('d', flowPathFn) // set the SVG path for each flow
      .attr('fill', (f) => f.fill[f.renderAs])
      .attr('stroke-width', (f) => ep(f.stroke_width[f.renderAs]))
      .attr('stroke', (f) => f.color)
      .attr('opacity', (f) => f.opacity)
      // add emphasis-on-hover behavior:
      .on('mouseover', turnOnFlowHoverEffects)
      .on('mouseout', turnOffFlowHoverEffects)
      // Sort flows to be rendered:
      // Shadows first (i.e. at the back), then largest-to-smallest
      // (so if flows cross, the smaller ones are drawn on top):
      .sort((a, b) => b.isAShadow - a.isAShadow || b.dy - a.dy);

  // Add a tooltip for each flow:
  diagFlows.append('title').text((f) => f.tooltip);

  // MARK Drag functions for Nodes

  // isAZeroMove: simple test of whether every offset is 0 (no move at all):
  function isAZeroMove(a) { return a.every((m) => m === 0); }

  // Given a Node index, apply its move to the SVG & remember it for later:
  function applyNodeMove(index) {
    const n = allNodes[index],
      // In the case of a reversed graph, we negate the x-move:
      myXMove = n.move[0] * (cfg.layout_reversegraph ? -1 : 1),
      availableW = graph.w - n.dx,
      availableH = graph.h - n.dy;

    // Apply the move to the node (halting at the edges of the graph):
    n.x = Math.max(
      0,
      Math.min(availableW, n.origPos.x + availableW * myXMove)
      );
    n.y = Math.max(
      0,
      Math.min(availableH, n.origPos.y + availableH * n.move[1])
      );

    // Find everything which shares the class of the dragged Node and
    // translate all of them with these offsets.
    // Currently this means the Node and the label+highlight, if present.
    // (Why would we apply a null transform? Because it may have been
    // transformed already & we are now undoing the previous operation.)
    d3.selectAll(`#sankey_svg .${n.css_class}`)
      .attr('transform', isAZeroMove(n.move)
        ? null
        : `translate(${ep(n.x - n.origPos.x)},${ep(n.y - n.origPos.y)})`);
  }

  // Set the new starting point of any constrained move:
  function updateLastNodePosition(n) { n.lastPos = { x: n.x, y: n.y }; }

  // rememberNodeMove: Save a move so it can be re-applied.
  // The value saved is the % of the available size that the node was moved,
  // not the literal pixel move. This helps when the user is changing
  // spacing or diagram size.
  function rememberNodeMove(n) {
    // Always update lastPos when remembering moves:
    updateLastNodePosition(n);
    if (isAZeroMove(n.move)) {
      // There's no actual move now. If one was stored, forget it:
      glob.rememberedMoves.delete(n.name);
    } else {
      // We save moves keyed to their NAME (not their index), so they
      // can be remembered even when the inputs change their order.
      //
      // In the case of a move already remembered, this will replace the
      // original moves with an identical copy...seems less trouble than
      // checking first.
      glob.rememberedMoves.set(n.name, n.move);
    }
    // The count of rememberedMoves may have changed, so also update the UI:
    updateResetNodesUI();
  }

  // After one or more Node moves are done, call this:
  function reLayoutDiagram() {
    // Recalculate all flow positions given new node position(s):
    sankeyObj.relayout();

    // For every flow, update its 'd' path attribute with the new
    // calculated path.
    diagFlows.attr('d', flowPathFn)
      // (This may *also* change how the flow must be rendered,
      // so derive those attributes again:)
      .attr('fill', (f) => f.fill[f.renderAs])
      .attr('stroke-width', (f) => ep(f.stroke_width[f.renderAs]));
  }

  // Show helpful guides/content for the current drag. We put it all in a
  // distinct 'g'roup for helper content so we can remove it easily later:
  function dragNodeStarted(event, n) {
    const grayColor = contrasting_gray_color(cfg.bg_color);
    let diagHelperLayer = diagMain.select('#helper_layer');
    // Create the helper layer if it doesn't exist:
    if (!diagHelperLayer.nodes.length) {
      // Insert it just before (i.e. 'under') the 'nodes' layer, so it
      // doesn't interfere with things like double-clicks on nodes.
      diagHelperLayer = diagMain.insert('g', '#sankey_nodes')
        .attr('id', 'helper_layer')
        // Set up attributes common to all the stuff inside here..
        .attr('fill', grayColor)
        .attr('fill-opacity', 0.5)
        .attr('stroke', 'none');
    }

    // Draw 4 horizontal/vertical guide lines, along the edges of the
    // place where the drag began (d.lastPos):
    diagHelperLayer.append('path')
      .attr('id', 'helper_lines')
      // This SVG Path spec means:
      // [M]ove to the left edge of the graph at this node's top
      // [h]orizontal line across the whole graph width
      // [m]ove down by this node's height
      // [H]orizontal line back to the left edge (x=0)
      // ..Then the same operation [v]ertically, using this node's width.
      .attr('d', `M0 ${ep(n.lastPos.y)} h${ep(graph.w)} m0 ${ep(n.dy)} H0`
           + `M${ep(n.lastPos.x)} 0 v${ep(graph.h)} m${ep(n.dx)} 0 V0`)
      .attr('stroke', grayColor)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '1 3')
      .attr('stroke-opacity', 0.7);

    // Put a ghost rectangle where this node started out:
    diagHelperLayer.append('rect')
      .attr('id', 'helper_original_rect')
      .attr('x', ep(n.origPos.x))
      .attr('y', ep(n.origPos.y))
      .attr('height', ep(n.dy))
      .attr('width', ep(n.dx))
      .attr('fill', n.color)
      .attr('fill-opacity', 0.3);

    // Check for the Shift key. If it's down when starting the drag, skip
    // the hint:
    if (!(event.sourceEvent && event.sourceEvent.shiftKey)) {
      // Place hint text where it can hopefully be seen,
      // in a [g]roup which can be removed later during dragging:
      const shiftHints = diagHelperLayer.append('g')
          .attr('id', 'helper_shift_hints')
          .attr('font-size', '14px')
          .attr('font-weight', '400'),
        hintHeights = graph.h > 350 ? [0.05, 0.95] : [0.4];
      // Show the text so it's visible but not overwhelming:
      hintHeights.forEach((h) => {
        shiftHints.append('text')
          .attr('text-anchor', 'middle')
          .attr('x', graph.w / 2)
          .attr('y', graph.h * h)
         .text('Hold down Shift to move in only one direction');
      });
    }
    return null;
  }

  // This is called _during_ Node drags:
  function draggingNode(event, n) {
    // Fun fact: In this context, event.subject is the same thing as 'd'.
    let myX = event.x,
      myY = event.y;
    const graphIsReversed = el('layout_reversegraph').checked;

    // Check for the Shift key:
    if (event.sourceEvent && event.sourceEvent.shiftKey) {
      // Shift is pressed, so this is a constrained drag.
      // Figure out which direction the user has dragged _further_ in:
      if (Math.abs(myX - n.lastPos.x) > Math.abs(myY - n.lastPos.y)) {
        myY = n.lastPos.y; // Use X move; keep Y constant
      } else {
        myX = n.lastPos.x; // Use Y move; keep X constant
      }
      // If they've Shift-dragged, they don't need the hint any more -
      // remove it and don't bring it back until the next gesture.
      const shiftHint = diagMain.select('#helper_shift_hints');
      if (shiftHint.nodes) { shiftHint.remove(); }
    }

    // Calculate the percentages we want to save (which will stay
    // independent of the graph's edge constraints, even if the spacing,
    // etc. changes to distort them):
    n.move = [
      // If the graph is RTL, calculate the x-move as though it is LTR:
      (graphIsReversed ? -1 : 1) * ((myX - n.origPos.x) / (graph.w - n.dx)),
      (graph.h === n.dy) ? 0 : (myY - n.origPos.y) / (graph.h - n.dy),
    ];

    applyNodeMove(n.index);
    // Note: We DON'T rememberNodeMove after every pixel-move of a drag;
    // just when a gesture is finished.
    reLayoutDiagram();
    return null;
  }

  // (Investigate: This is called on every ordinary *click* as well; look
  // into skipping this work if no actual move has happened.)
  function dragNodeEnded(event, n) {
    // Take away the helper guides:
    const helperLayer = diagMain.select('#helper_layer');
    if (helperLayer.nodes) { helperLayer.remove(); }

    // After a drag is finished, any new constrained drag should use the
    // _new_ position as 'home'. Therefore we have to set this as the
    // 'last' position:
    rememberNodeMove(n);

    // Sometimes the pointer has ALSO been over a flow, which means
    // that any flow & its labels could be highlighted in the produced
    // SVG and PNG - which is not what we want.
    // Therefore, at the end of any drag, turn *off* any lingering
    // hover-effects before we render the PNG+SVG:
    allFlows.filter((f) => f.hovering)
      .forEach((f) => { turnOffFlowHoverEffects(null, f); });

    reLayoutDiagram();
    return null;
  }

  // A double-click resets a node to its default rendered position:
  function doubleClickNode(event, n) {
    n.move = [0, 0];
    applyNodeMove(n.index);
    rememberNodeMove(n);
    reLayoutDiagram();
    return null;
  }

  // Set up the <g>roup of Nodes, including drag behavior:
  const diagNodes = diagMain.append('g')
    .attr('id', 'sankey_nodes')
    .selectAll('.node')
    .data(allNodes.filter(shadowFilter))
    .enter()
    .append('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', dragNodeStarted)
      .on('drag', draggingNode)
      .on('end', dragNodeEnded))
    .on('dblclick', doubleClickNode);

  // Set up Node borders, if specified:
  if (cfg.node_border) {
    diagNodes.append('rect')
      .attr('id', (n) => `${n.dom_id}_border`)
      .attr('class', (n) => n.css_class)
      .attr('x', (n) => ep(n.x))
      .attr('y', (n) => ep(n.y))
      .attr('height', (n) => ep(n.dy))
      .attr('width', (n) => ep(n.dx))
      .attr('stroke', (n) => n.border_color)
      .attr('stroke-width', cfg.node_border)
      .attr('fill', 'none');
  }

  // Construct the main <rect>angles for NODEs:
  diagNodes.append('rect')
    // Give a unique ID & class to each rect that we can reference:
    .attr('id', (n) => n.dom_id)
    .attr('class', (n) => n.css_class)
    .attr('x', (n) => ep(n.x))
    .attr('y', (n) => ep(n.y))
    .attr('height', (n) => ep(n.dy))
    .attr('width', (n) => ep(n.dx))
    // we made sure above there will be a color defined:
    .attr('fill', (n) => n.color)
    .attr('fill-opacity', (n) => n.opacity)
    // Add tooltips showing node totals:
    .append('title')
    .text((n) => n.tooltip);

  // Create a top layer for labels & highlights, so nodes can't block them:
  const diagLabels = diagMain.append('g')
    .attr('id', 'sankey_labels')
    // 这些字体设置只作为默认，具体tspan会覆盖
    .attr('font-family', cfg.labels_fontface)
    .attr('font-size', `${ep(cfg.labelname_size)}px`)
    .attr('fill', cfg.labels_color);

  if (cfg.meta_mentionsankeymatic) {
    // 使用图片logo
    const logoWidth = 160;
    const logoHeight = 40;
    const x = cfg.size_w / 2 - graph.final_margin_l - logoWidth / 2;
    const y = graph.h + cfg.margin_b - logoHeight / 2 - 30;
    diagLabels.append('image')
      .attr('xlink:href', 'i/logo.png')
      .attr('x', ep(x))
      .attr('y', ep(y))
      .attr('width', logoWidth)
      .attr('height', logoHeight)
      .attr('preserveAspectRatio', 'xMidYMid meet');
  }

  if (!cfg.labels_hide && (cfg.labelname_appears || cfg.labelvalue_appears)) {
    // Add labels in a distinct layer on the top (so nodes can't block them)
    diagLabels.selectAll()
      .data(allNodes.filter(shadowFilter))
      .enter()
      .filter((n) => !n.hideLabel)
      .append('text')
        .attr('id', (n) => n.label.dom_id)
        .attr('class', (n) => n.css_class)
        .attr('text-anchor', (n) => n.label.anchor)
        .attr('x', (n) => ep(n.label.x))
        .attr('y', (n) => ep(n.label.y))
        .attr('font-weight', (n) => n.labelList[0].weight)
        .attr('font-size', (n) => `${ep(n.labelList[0].size)}px`)
        .attr('dy', (n) => ep(n.label.dy))
        .each(function(n) {
          // 清空初始内容
          d3.select(this).text(null);
          // 颜色优先级：节点级别 > 全局
          const nodeNameColor = n.labelname_color || cfg.labelname_color || cfg.labels_color;
          const nodeValueColor = n.labelvalue_color || cfg.labelvalue_color || cfg.labels_color;
          const nodeChangeColor = n.labelchange_color || cfg.labelchange_color || cfg.labels_color;
          // 遍历 labelList，分别渲染 name/value/change
          n.labelList.forEach((frag, idx) => {
            let color = nodeNameColor;
            // 判断类型
            if (idx === 0 && n.labelList.length > 1 && frag.txt === withUnits(n.value)) {
              // value在第一个且有多个片段
              color = nodeValueColor;
            } else if (frag.txt === withUnits(n.value)) {
              color = nodeValueColor;
            } else if (frag.txt && frag.txt.includes('%') && frag.txt.includes(cfg.labelchange_suffix || '')) {
              color = nodeChangeColor;
            } else if (idx > 0 && n.labelList[idx-1].txt === withUnits(n.value)) {
              // value后紧跟change
              if (frag.txt && frag.txt.includes('%')) color = nodeChangeColor;
            }
            d3.select(this).append('tspan')
              .attr('font-weight', frag.weight)
              .attr('font-size', `${ep(frag.size)}px`)
              .attr('x', ep(n.label.x))
              .attr('dy', frag.newLine ? ep((0.95 + cfg.labels_linespacing) * (frag.size)) : null)
              .attr('fill', color)
              .text(frag.txt);
          });
        });

    // For any nodes with a label highlight defined, render it:
    allNodes.filter(shadowFilter)
      .filter((n) => n.label?.bg)
      .forEach((n) => {
      // Use each label's size to make custom round-rects underneath:
      const labelTextSelector = `#${n.label.dom_id}`,
        labelBB
          = diagLabels.select(labelTextSelector).node().getBBox(),
        bg = n.label.bg;
      // Put the highlight rectangle just before each text:
      diagLabels.insert('rect', labelTextSelector)
        .attr('id', bg.dom_id)
        // Attach a class to make a drag operation affect a Node's label too:
        .attr('class', n.css_class)
        .attr('x', ep(labelBB.x + bg.offset.x))
        .attr('y', ep(labelBB.y + bg.offset.y))
        .attr('width', ep(labelBB.width + bg.offset.w))
        .attr('height', ep(labelBB.height + bg.offset.h))
        .attr('rx', ep(cfg.labelname_size / 4))
        .attr('fill', bg.fill)
        .attr('fill-opacity', ep(bg.fill_opacity))
        .attr('stroke', bg.stroke)
        .attr('stroke-width', ep(bg.stroke_width))
        .attr('stroke-opacity', ep(bg.stroke_opacity));
    });
  }

  // Now that all of the SVG nodes and labels exist, it's time to re-apply
  // any remembered moves:
  if (glob.rememberedMoves.size) {
    // Make a copy of the list of moved-Node names (so we can destroy it):
    const movedNodes = new Set(glob.rememberedMoves.keys());

    // Look for all node objects matching a name in the list:
    allNodes.filter(shadowFilter)
      .filter((n) => movedNodes.has(n.name))
      .forEach((n) => {
        n.move = glob.rememberedMoves.get(n.name);
        // Make this move visible in the diagram:
        applyNodeMove(n.index);
        updateLastNodePosition(n);
        // DON'T 'rememberNodeMove' here - if we do, then the last
        // manual move will be unintentionally modified when only the
        // spacing was changed, for example.

        // Delete this moved node's name from the Set:
        movedNodes.delete(n.name);
      });
    // Any remaining items in movedNodes must refer to Nodes which are no
    // longer with us. Delete those from the global memory:
    movedNodes.forEach((nodeName) => {
      glob.rememberedMoves.delete(nodeName);
    });

    // Re-layout the diagram once, after all of the above moves:
    reLayoutDiagram();
  }

  // Add logo to the diagram (使用嵌入的base64图片)
  // 原始logo尺寸: 813x192, 按比例缩放到合适大小
  const logoWidth = 160;
  const logoHeight = Math.round(logoWidth * 192 / 813); // 保持原始比例
  diagramRoot.append('g')
    .attr('id', 'sankeymatic-logo')
    .html(`
      <image x="${cfg.size_w / 2 - logoWidth/2}" y="${cfg.size_h - logoHeight - 10}" width="${logoWidth}" height="${logoHeight}"
             href="${LOGO_BASE64}" opacity="0.9"/>
    `);
} // end of render_sankey

// MARK Serializing the diagram

// Run through the current input lines & drop any old headers &
// successfully applied settings. Returns a trimmed string.
function removeAutoLines(lines) {
  return lines
    .filter((l) => !(
      l.startsWith(sourceHeaderPrefix)
      || l.startsWith(settingsAppliedPrefix)
      || [settingsMarker, userDataMarker, sourceURLLine, movesMarker]
          .includes(l)
      ))
    .join('\n')
    .replace(/^\n+/, '') // trim blank lines at the start & end
    .replace(/\n+$/, '');
}

/**
 * Produce a text representation of the current diagram, including settings
 * @param {boolean} verbose - If true, include extra content for humans
 * @returns {string}
 */
function getDiagramDefinition(verbose) {
  const outputLines = [],
    customOutputFns = new Map([
      ['list', (v) => `'${v}'`], // Always quote 'list' values
      // In a text field we may encounter single-quotes, so double those:
      ['text', (v) => `'${v.replaceAll("'", "''")}'`],
    ]);
  let currentSettingGroup = '';

  // outputFldName: produce the full field name or an indented short version:
  function outputFldName(fld) {
    const prefixLen = currentSettingGroup.length,
      shortFldName = prefixLen && fld.startsWith(`${currentSettingGroup}_`)
      ? `  ${fld.substring(prefixLen + 1)}`
      : fld;
    return shortFldName.replaceAll('_', ' ');
  }

  function add(...lines) { outputLines.push(...lines); }
  function addIfV(...lines) { if (verbose) { add(...lines); } }

  addIfV(
    `${sourceHeaderPrefix} Saved: ${glob.humanTimestamp()}`,
    sourceURLLine,
    '',
    userDataMarker,
    ''
    );
  add(removeAutoLines(elV(userInputsField).split('\n')));
  addIfV('', settingsMarker, '');

  // Add all of the settings:
  skmSettings.forEach((fldData, fldName) => {
    if (fldName.startsWith('internal_')) { return; } // Ignore internals

    const dataType = fldData[0],
      activeHVal = getHumanValueFromPage(fldName, dataType),
      outVal = customOutputFns.has(dataType)
        ? customOutputFns.get(dataType)(activeHVal)
        : activeHVal;
    add(`${outputFldName(fldName)} ${outVal}`);
    currentSettingGroup = fldName.split('_')[0];
  });

  // If there are any manually-moved nodes, add them to the output:
  if (glob.rememberedMoves.size) {
    addIfV('', movesMarker, '');
    glob.rememberedMoves.forEach((move, nodeName) => {
      add(`move ${nodeName} ${ep(move[0])}, ${ep(move[1])}`);
    });
  }

  return outputLines.join('\n');
}

const urlInputsParam = 'i',
  linkTargetDiv = 'generatedLink',
  copiedMsgId = 'copiedMsg';

/**
 * @returns {URL}
 */
function generateLink() {
  const minDiagramDef = getDiagramDefinition(false),
    compressed = LZString.compressToEncodedURIComponent(minDiagramDef),
    currentUrl = new URL(glob.location.href);
  // Set the new parameter, encoded to keep it from wrapping strangely:
  currentUrl.search
    = `${urlInputsParam}=${
      encodeURIComponent(compressed).replaceAll('-', '%2D')
    }`;
  return currentUrl;
}

// MARK Save/Load diagram definitions in text files

glob.saveDiagramToFile = () => {
  const verboseDiagramDef = getDiagramDefinition(true);
  downloadATextFile(
    verboseDiagramDef,
    `sankeymatic_${glob.fileTimestamp()}_source.txt`
  );
};

glob.loadDiagramFile = async () => {
  const fileList = el('load_diagram_from_file').files;

  // Did the user provide a file?
  if (fileList.length === 0) { return; }

  // Read the file's text contents:
  const uploadedText = await fileList[0].text(),
    userFileName = fileList[0].name;
  setUpNewInputs(uploadedText, highlightSafeValue(userFileName));
  glob.process_sankey();
};

// MARK dialog functions

/**
 * @param {string} dId - the ID of the dialog element to close (minus 'Dialog')
 */
glob.closeDialog = (dId) => {
  const dEl = el(`${dId}Dialog`);
  if (dEl) { dEl.close(); }
};

glob.openGetLinkDialog = () => {
  const dEl = el('getLinkDialog');
  if (dEl) {
    dEl.showModal();
    // Make the link for the current diagram's state & fill it in:
    const diagramUrl = generateLink(),
      tEl = el(linkTargetDiv);
    tEl.innerText = diagramUrl.toString();
    tEl.focus();
  }
};

glob.copyGeneratedLink = () => {
  if (glob.navigator?.clipboard) {
    glob.navigator.clipboard.writeText(el(linkTargetDiv).innerText);
    el(copiedMsgId).innerText = 'Copied!';
    setTimeout(() => { el(copiedMsgId).innerText = ''; }, 2000);
  }
};

/**
 * If we are running in the browser context, check for a serialized diagram
 * in the URL parameters. If found, load it.
 */
function loadFromQueryString() {
  const searchString = glob.location?.search;
  if (searchString) {
    const compressedInputs
      = new URLSearchParams(searchString)?.get(urlInputsParam);
    if (compressedInputs) {
      const expandedInputs
        = LZString.decompressFromEncodedURIComponent(compressedInputs);
      // Make sure the input was successfully read.
      // (LZstring gives back a blank string or a null when it fails):
      if (expandedInputs) {
        setUpNewInputs(expandedInputs, 'URL');
      } else {
        // Tell the user something went wrong:
        msg.addToQueue(
          `The input string provided in the URL (${highlightSafeValue(
            `${compressedInputs.substring(0, 8)}...`
          )}) was not decodable.`,
          'issue'
        );
      }
    }
  }
}

// MAIN FUNCTION:
// process_sankey: Called directly from the page and within this script.
// Gather inputs from user; validate them; render updated diagram
glob.process_sankey = () => {
  let [maxDecimalPlaces, maxNodeIndex, maxNodeVal] = [0, 0, 0];
  const uniqueNodes = new Map();

  // Update the display of all known themes given their offsets:
  function updateColorThemeDisplay() {
    // template string for the color swatches:
    const makeSpanTag = (color, count, themeName) => (
      `<span style="background-color: ${color};" `
      + `class="color_sample_${count}" `
      + `title="${color} from d3 color scheme ${themeName}">`
      + '&nbsp;</span>'
    );
    for (const t of colorThemes.keys()) {
      const theme = approvedColorTheme(t),
        themeOffset = elV(offsetField(t)),
        colorset = rotateColors(theme.colorset, themeOffset),
        // Show the array rotated properly given the offset:
        renderedGuide = colorset
          .map((c) => makeSpanTag(c, colorset.length, theme.d3Name))
          .join('');
        // SOMEDAY: Add an indicator for which colors are/are not
        // in use?
      el(`theme_${t}_guide`).innerHTML = renderedGuide;
      el(`theme_${t}_label`).textContent = theme.nickname;
    }
  }

  // NODE-handling functions:

  /**
   * Parse the node name to find out if it is in strike-through format
   * (e.g. '-hidden label-').
   * @param {string} rawName a node name from the input data
   * @returns {object} nameInfo
   * @returns {string} nameInfo.trueName The real node name (without dashes)
   * @returns {boolean} nameInfo.hideLabel True if the name was struck through
   */
  function parseNodeName(rawName) {
    const hiddenNameMatches = rawName.match(/^-(.*)-$/),
      hideThisLabel = hiddenNameMatches !== null,
      trueName = hideThisLabel ? hiddenNameMatches[1] : rawName;
    return { trueName: trueName, hideLabel: hideThisLabel };
  }

  /**
   * Make sure a node's name is present in the main list, with the lowest row
   * number the node has appeared on.
   * @param {string} nodeName A raw node name from the input data
   * @param {number} row The number of the input row the node appeared on.
   *  (This can be a non-integer; Target node names have 0.5 added to their
   *  row number.)
   * @returns {object} The node's object (from uniqueNodes)
   */
  function setUpNode(nodeName, row) {
    const { trueName, hideLabel } = parseNodeName(nodeName),
      thisNode = uniqueNodes.get(trueName); // Does this node exist?
    if (thisNode) {
      // If so, should the new row # replace the stored row #?:
      if (thisNode.sourceRow > row) { thisNode.sourceRow = row; }
      // Update hideLabel if this instance of the name was struck through:
      thisNode.hideLabel ||= hideLabel;
      return thisNode;
    }
    // This is a new Node. Set up its object, keyed to its trueName:
    const newNode = {
      name: trueName,
      tipname: trueName.replaceAll('\\n', ' '),
      hideLabel: hideLabel,
      sourceRow: row,
      paintInputs: [],
      unknowns: { [IN]: new Set(), [OUT]: new Set() },
    };
    uniqueNodes.set(trueName, newNode);
    return newNode;
  }

  // updateNodeAttrs: Update an existing node's attributes.
  // Note: If there are multiple lines specifying a value for the same
  // parameter for a node, the LAST declaration will win.
  function updateNodeAttrs(nodeParams) {
    // Just in case this is the first appearance of the name (or we've
    // encountered an earlier row than the node declaration), add it to
    // the big list:
    const thisNode = setUpNode(nodeParams.name, nodeParams.sourceRow);

    // We've already used the 'sourceRow' value and don't want it to
    // overwrite anything, so take it out of the params object:
    delete nodeParams.sourceRow;

    // If there's a color and it's a color CODE, put back the #:
    // TODO: honor or translate color names?
    if (reBareColor.test(nodeParams.color)) {
      nodeParams.color = `#${nodeParams.color}`;
    }

    // Don't overwrite the 'name' value here, it can mess up tooltips:
    delete nodeParams.name;

    Object.entries(nodeParams).forEach(([pName, pVal]) => {
      if (typeof pVal !== 'undefined' && pVal !== null && pVal !== '') {
        thisNode[pName] = pVal;
      }
    });
  }

  // Go through lots of validation with plenty of bailout points and
  // informative messages for the poor soul trying to do this.

  // Note: Checking the 'Transparent' background-color box *no longer* means
  // that the background-color-picker is pointless; it still affects the color
  // value which will be given to "Made with SankeyMATIC".
  // Therefore, we no longer disable the Background Color element, even when
  // 'Transparent' is checked.

  // BEGIN by resetting all message areas & revealing any queued messages:
  msg.resetAll();
  msg.showQueued();

  // Time to parse the user's input.
  // Before we do anything at all, split it into an array of lines with
  // no whitespace at either end.
  // As part of this step, we make sure to drop any zero-width spaces
  // which may have been appended or prepended to lines (e.g. when pasted
  // from PowerPoint), then trim again.
  const origSourceLines = elV(userInputsField).split('\n'),
    sourceLines = origSourceLines.map(
      (l) => l.trim()
        .replace(/^\u200B+/, '')
        .replace(/\u200B+$/, '')
        .trim()
    ),
    invalidLines = [], // contains objects with a 'value' and 'message'
    linesWithSettings = new Set(),
    linesWithValidSettings = new Set();

  function warnAbout(line, warnMsg) {
    invalidLines.push({ value: line, message: warnMsg });
  }

  // Search for Settings we can apply:
  let currentSettingGroup = '';
  sourceLines.forEach((lineIn, row) => {
    // Is it a Move line?
    const moveParts = lineIn.match(reMoveLine);
    if (moveParts !== null) {
      linesWithSettings.add(row);
      // Save this as a rememberedMove.
      // We don't verify the name because we don't yet know the list to
      // match against. Assume the node names are provided in good faith.
      const [nodeName, moveX, moveY] = moveParts.slice(-3);
      glob.rememberedMoves.set(nodeName, [Number(moveX), Number(moveY)]);
      linesWithValidSettings.add(row);
      return;
    }

    // Does it look like a regular Settings line (number, keyword, color)
    // OR a Settings line with a quoted string?
    const settingParts
      = lineIn.match(reSettingsValue) ?? lineIn.match(reSettingsText);

    // If either was found, let's process it:
    if (settingParts !== null) {
      // We found something, so remember this row index:
      linesWithSettings.add(row);

      // Derive the setting name we're looking at:
      let origSettingName = settingParts[1],
        settingName = origSettingName.replace(/\s+/g, '_');

      // Syntactic sugar - if the user typed the long version of a word,
      // fix it up so it's just the 1st letter so it will work:
      'width height left right top bottom' // => w, h, l, r, t, b
        .split(' ')
        .filter((l) => settingName.endsWith(l))
        .forEach((long) => {
          settingName = settingName.replace(long, long[0]);
        });

      // If the given settingName still isn't valid, and it isn't already
      // two words, try it with the prefix from the prior settings row:
      if (!skmSettings.has(settingName)
          && !/_/.test(settingName)
          && currentSettingGroup.length) {
        settingName = `${currentSettingGroup}_${settingName}`;
        origSettingName = `${currentSettingGroup} ${origSettingName}`;
      }

      // Update the group-prefix, whether or not the value validates
      // below. (Better to honor this prefix than to use one from
      // further up.):
      currentSettingGroup = settingName.split('_')[0];

      const settingData = skmSettings.get(settingName);
      // Validate & apply:
      if (settingData) {
        const settingValue = settingParts[2],
          dataType = settingData[0],
          sizeObj = dataType === 'contained'
            ? { w: elV('size_w'), h: elV('size_h') }
            : {},
          [validValue, finalValue]
            = settingIsValid(settingData, settingValue, sizeObj);
        if (validValue) {
          setValueOnPage(settingName, dataType, finalValue);
          linesWithValidSettings.add(row);
          return;
        }
        // The setting exists but the value wasn't right:
        warnAbout(
          settingValue,
          `Invalid value for <strong>${origSettingName}<strong>`
        );
      } else {
        // There wasn't a setting matching this name:
        warnAbout(origSettingName, 'Not a valid setting name');
      }
    }
  });

  //  Parse inputs into: approvedNodes, approvedFlows
  const goodFlows = [],
    approvedNodes = [],
    approvedFlows = [],
    SYM_USE_REMAINDER = '*',
    SYM_FILL_MISSING = '?',
    reFlowLine = new RegExp(
      '^(?<sourceNode>.+)'
      + `\\[(?<amount>[\\d\\s.+-]+|\\${SYM_USE_REMAINDER}|\\${SYM_FILL_MISSING}|)\\]`
      + '(?<targetNodePlus>.+)$'
    );

  /**
   * @param {string} fv A flow's value.
   * @returns {boolean} True if the value is a special calculation symbol
   */
  function flowIsCalculated(fv) {
    return [SYM_USE_REMAINDER, SYM_FILL_MISSING].includes(fv);
  }

  // Loop through all the non-setting input lines:
  sourceLines.filter((l, i) => !linesWithSettings.has(i))
    .forEach((lineIn, row) => {
    // Is it a blank line OR a comment? Skip it entirely:
    if (lineIn === '' || reCommentLine.test(lineIn)) {
      return;
    }

    // Does this line look like a Node?
    let matches = lineIn.match(reNodeLine);
    if (matches !== null) {
      // Parse label colors from {labelname_color,labelvalue_color,labelchange_color} syntax
      const labelColors = {};
      if (matches[5]) {
        const colorParts = matches[5].split(',');
        if (colorParts[0] && colorParts[0].trim()) labelColors.labelname_color = colorParts[0].trim();
        if (colorParts[1] && colorParts[1].trim()) labelColors.labelvalue_color = colorParts[1].trim();
        if (colorParts[2] && colorParts[2].trim()) labelColors.labelchange_color = colorParts[2].trim();
      }

      // Save/update it in the uniqueNodes structure:
      updateNodeAttrs({
        name: matches[1].trim(),
        color: matches[2],
        opacity: matches[3],
        previousValue: matches[4], // previousValue from [previousValue] syntax
        ...labelColors, // Spread label colors
        paintInputs: [matches[6], matches[7]], // Adjusted indices due to new capture group
        sourceRow: row,
      });
      // No need to process this as a Data line, let's move on:
      return;
    }

    // Does this line look like a Flow?
    matches = lineIn.match(reFlowLine);
    if (matches !== null) {
      const amountIn = matches[2].replace(/\s/g, ''),
        isCalculated = flowIsCalculated(amountIn);

      // Is the Amount actually blank? Treat that like a comment (but log it):
      if (amountIn === '') {
        msg.log(`<span class="info_text">Skipped empty flow:</span> ${escapeHTML(lineIn)}`);
        return;
      }

      // Is Amount a number or a special operation?
      // Reject the line if it's neither:
      if (!isNumeric(amountIn) && !isCalculated) {
        warnAbout(
          lineIn,
          `The [Amount] must be a number in the form #.# or a wildcard ("${SYM_USE_REMAINDER}" or "${SYM_FILL_MISSING}").`
        );
        return;
      }
      // Diagrams don't currently support negative numbers:
      if (Number(amountIn) < 0) {
        warnAbout(lineIn, 'Amounts must not be negative');
        return;
      }

      // All seems well, save it as good:
      goodFlows.push({
        source: matches[1].trim(),
        target: matches[3].trim(),
        amount: amountIn,
        sourceRow: row,
        // Remember any special symbol even after the amount will be known:
        operation: isCalculated ? amountIn : null,
      });

      // We need to know the maximum precision of the inputs (greatest
      // # of characters to the RIGHT of the decimal) for some error
      // checking operations (& display) later:
      maxDecimalPlaces = Math.max(
        maxDecimalPlaces,
        (amountIn.split('.')[1] || '').length
      );
      return;
    }

    // This is a non-blank line which did not match any pattern:
    warnAbout(
      lineIn,
      'Does not match the format of a Flow or Node or Setting'
      );
  });

  // TODO: Disable useless precision checkbox if maxDecimalPlaces === 0
  // TODO: Look for cycles and post errors about them

  // Mention any un-parseable lines:
  invalidLines.forEach((parsingError) => {
    msg.add(
      `${parsingError.message}: ${highlightSafeValue(parsingError.value)}`,
      'issue'
    );
  });

  // Make the final list of Flows, linked to their Node objects:
  const graphIsReversed = el('layout_reversegraph').checked;
  goodFlows.forEach((flow) => {
    const thisFlow = {
        hovering: false,
        index: approvedFlows.length,
        sourceRow: flow.sourceRow,
        operation: flow.operation,
        value: flow.amount,
        color: '', // may be overwritten below
        opacity: '', // ""
      },
      // Try to parse any extra info that isn't actually the target's name.
      // The format of the Target string can be: "Name [#color[.opacity]]"
      //   e.g. 'x [...] y #99aa00' or 'x [...] y #99aa00.25'
      // Look for a candidate string starting with # for color info:
      flowTargetPlus = flow.target.match(reFlowTargetWithSuffix);
    if (flowTargetPlus !== null) {
      // IFF the # string matches a stricter pattern, separate the target
      // string into parts:
      const [, possibleNodeName, possibleColor] = flowTargetPlus,
        colorOpacity = possibleColor.match(reColorPlusOpacity);
      if (colorOpacity !== null) {
        // Looks like we found a color or opacity or both.
        // Update the target's name with the trimmed string:
        flow.target = possibleNodeName;
        // If there was a color, adopt it:
        if (colorOpacity[1]) { thisFlow.color = `#${colorOpacity[1]}`; }
        // If there was an opacity, adopt it:
        if (colorOpacity[2]) { thisFlow.opacity = colorOpacity[2]; }
      }
      // Otherwise we will treat it as part of the nodename, e.g. "Team #1"
    }

    // Make sure the node names get saved; it may be their only appearance:
    thisFlow.source = setUpNode(flow.source, flow.sourceRow);
    thisFlow.target = setUpNode(flow.target, flow.sourceRow + 0.5);

    if (graphIsReversed) {
      [thisFlow.source, thisFlow.target] = [thisFlow.target, thisFlow.source];
      // Calculations must also flow in the opposite direction:
      if (thisFlow.operation) {
        thisFlow.operation
          = thisFlow.operation === SYM_USE_REMAINDER
            ? SYM_FILL_MISSING
            : SYM_USE_REMAINDER;
      }
    }

    approvedFlows.push(thisFlow);
  });

  // MARK: Calculate any dependent amounts

  // Set up constants we will need:
  // SYM_USE_REMAINDER = Adopt any remainder from this flow's SOURCE
  // SYM_FILL_MISSING = Adopt any unused amount from this flow's TARGET
  const outOfSource = { node: 'source', dir: OUT },
    intoTarget = { node: 'target', dir: IN },
    calculationKeys = {
      [SYM_USE_REMAINDER]: { leaving: outOfSource, arriving: intoTarget },
      [SYM_FILL_MISSING]: { leaving: intoTarget, arriving: outOfSource },
    },
    // Make a handy set containing all calculating flows:
    queueOfFlows = new Set(approvedFlows.filter((flow) => flow.operation)),
    // Track each Node touched by a calculated flow:
    involvedNodes = new Set();
  // Now, store in each Node references to each unknown Flow touching it.
  // Later we'll use the counts of unkonwns.
  queueOfFlows.forEach((f) => {
    const k = calculationKeys[f.operation];
    // Add references to the unknowns to their related Nodes.
    f[k.leaving.node].unknowns[k.leaving.dir].add(f);
    involvedNodes.add(f[k.leaving.node].name);
    f[k.arriving.node].unknowns[k.arriving.dir].add(f);
    involvedNodes.add(f[k.arriving.node].name);
  });

  if (queueOfFlows.size) {
    msg.logOnce('declareCalculations', '<b>Resolving calculated flows.</b>');
    // For each involvedNode: is it an endpoint or origin?
    // (Terminal nodes have an implicit additional unknown side.)
    // We'd rather check with n.flows[].length, but that's not set up yet.
    approvedFlows.forEach((f) => {
      // Initialize the struct if it's not present. Begin with both = true.
      f.source.terminates ??= { [IN]: true, [OUT]: true };
      f.target.terminates ??= { [IN]: true, [OUT]: true };
      // Update relevant values to false if they aren't already:
      f.source.terminates[OUT] &&= !involvedNodes.has(f.source.name);
      f.target.terminates[IN] &&= !involvedNodes.has(f.target.name);
    });
  }

  // Make a place to keep the unknown count for each calculated flow's parent.
  // (It is cleared & re-built each time through the loop.)
  const parentUnknowns = new Map();

  function resolveEligibleFlow(ef) {
    const k = calculationKeys[ef.operation],
      parentN = ef[k.leaving.node],
      unknownCt = Math.trunc(parentUnknowns.get(ef)); // strip any .5s

    // Special notifications regarding more ambiguous flows:
    let unknownMsg = '';
    if (unknownCt > 1) {
      unknownMsg
        = ` (&lsquo;${parentN.tipname}&rsquo; had ${unknownCt} unknowns)`;
      // Say - once! - that we are in Ambiguous Territory. (We do this here
      // because the very next console msg will mention the multiple unknowns.)
      msg.logOnce(
        'warnAboutAmbiguousFlows',
        '<em>Note: Beyond this point, some flow amounts depended on multiple unknown values.<br>' +
          'They will be resolved in the order of fewest unknowns + their order in the input data.</em>'
      );
    }

    // Find any flows which touch the 'parent' (i.e. data source).
    // We check af.value here, *not* .operation. If a calculation has been
    //   completed, we want to know that resulting amount.
    // (Note: We won't re-process flow 'ef' in this inner loop --
    //   the 'flowIsCalculated' filter excludes its unresolved .value)
    let [parentTotal, siblingTotal] = [0, 0];
    approvedFlows
      .filter(
        (af) => !flowIsCalculated(af.value)
          && [af[k.arriving.node].name, af[k.leaving.node].name]
            .includes(parentN.name)
      )
      .forEach((af) => {
        if (parentN.name === af[k.arriving.node].name) {
          // Add up amounts arriving at the parent from the other side:
          parentTotal += Number(af.value);
        } else {
          // Add up sibling amounts (flows leaving the parent on our side):
          siblingTotal += Number(af.value);
        }
      });
    // Update this flow with the calculated amount (preventing negatives):
    ef.value = Math.max(0, parentTotal - siblingTotal);
    // Remove this flow from the 'unknowns' lists & from the queue:
    ef[k.leaving.node].unknowns[k.leaving.dir].delete(ef);
    ef[k.arriving.node].unknowns[k.arriving.dir].delete(ef);
    queueOfFlows.delete(ef);
    msg.log(
      `<span class="info_text">Calculated:</span> ${escapeHTML(
        `${ef.source.tipname} [${ef.operation}] ${ef.target.tipname}`
      )} = <span class="calced">${ep(ef.value)}</span>${unknownMsg}`
    );
  }

  /**
   * Test whether a flow's parent has only 1 unknown value left.
   * @param {object} flow - the specific flow to test
   * @returns true when the unknown count for the flow's parent is exactly 1
   */
  function has_one_unknown(flow) { return parentUnknowns.get(flow) === 1; }

  // Now, resolve the flows in order from most certain to least certain:
  while (queueOfFlows.size) {
    // First, (re)calculate every flow's count of unknowns on its parent:
    parentUnknowns.clear();
    queueOfFlows.forEach((f) => {
      const k = calculationKeys[f.operation],
        parentN = f[k.leaving.node];
      // If an unknown flow connects to a terminating node, it should be ranked
      // lower. All internal singletons should solidify first.
      // After we have resolved all other singletons, only then should we
      // resolve flows with terminating nodes before proceeding to the
      // indeterminate flows. To achieve this, we add 0.5 to a flow's
      // parentUnknowns value when either end terminates.
      f.terminalAdj // Note: this only needs to be derived once.
        ??= parentN.terminates[k.arriving.dir]
          || f[k.arriving.node].terminates[k.leaving.dir]
          ? 0.5
          : 0;
      parentUnknowns.set(
        f,
        parentN.unknowns[IN].size + parentN.unknowns[OUT].size + f.terminalAdj
      );
    });
    // Helpful for debugging - Array.from(parentUnknowns).sort((a, b) => a[1] - b[1])
    //   .forEach((x) => console.log(`${x[0].source.tipname} ${x[0].operation}`
    //     + ` ${x[0].target.tipname}: ${x[1]}`));
    // console.log('');

    // Next, prioritize the flows by their count of unknowns (ascending),
    // then by sourceRow (ascending):
    const sortedFlows
      = Array.from(queueOfFlows.values())
        .sort((a, b) => parentUnknowns.get(a) - parentUnknowns.get(b)
          || a.sourceRow - b.sourceRow);

    // Are there ANY flows with a single unknown?
    if (has_one_unknown(sortedFlows[0])) {
      // We have /at least/ one. Resolve all the singletons we can!
      sortedFlows
        .filter((f) => has_one_unknown(f))
        .forEach((f) => resolveEligibleFlow(f));
    } else {
      // Here we had _no_ internal singletons. We will resolve ONE ambiguous
      // flow, then loop again to look for any resulting fresh singletons.
      resolveEligibleFlow(sortedFlows[0]);
    }
    // Repeat the loop, i.e. recalculate unknowns given the new landscape:
  }
  // Done calculating!

  // Construct the final list of approved_nodes, sorted by their order of
  // appearance in the source:
  Array.from(uniqueNodes.values())
    .sort((a, b) => a.sourceRow - b.sourceRow)
    .forEach((n) => {
      // Set up color inheritance signals from '<<' and '>>' indicators:
      const paintL = n.paintInputs.some((s) => s === '<<'),
        paintR = n.paintInputs.some((s) => s === '>>');
      // If the graph is reversed, swap the directions:
      n.paint = {
        [BEFORE]: graphIsReversed ? paintR : paintL,
        [AFTER]: graphIsReversed ? paintL : paintR,
      };
      // After establishing the above, the raw paint inputs aren't needed:
      delete n.paintInputs;
      n.index = approvedNodes.length;

      approvedNodes.push(n);
    });

  // MARK Import settings from the page's UI:

  const approvedCfg = {};

  skmSettings.forEach((fldData, fldName) => {
    const [dataType, defaultVal] = fldData,
      fldVal = getHumanValueFromPage(fldName, dataType),
      sizeObj = dataType === 'contained'
        ? { w: approvedCfg.size_w, h: approvedCfg.size_h }
        : {},
      // Consult the oracle to know if it's a good value:
      [validSetting, finalValue] = settingIsValid(fldData, fldVal, sizeObj);

    if (validSetting) {
      approvedCfg[fldName] = finalValue;
      return;
    }

    // If we got bad input somehow, reset both the field on the web page
    // AND the value in the approvedCfg to be the default:
    const typedVal = settingHtoC(defaultVal, dataType);
    approvedCfg[fldName] = typedVal;
    setValueOnPage(fldName, dataType, typedVal);
  });

  // Since we know the canvas' intended size now, go ahead & set that up
  // (before we potentially quit):
  const chartEl = el('chart');
  chartEl.style.height = `${approvedCfg.size_h}px`;
  chartEl.style.width = `${approvedCfg.size_w}px`;

  // Also update the PNG download buttons' title text with these dimensions:
  [1, 2, 4, 6].forEach((s) => {
    el(`save_as_png_${s}x`).title
      = `PNG image file: ${approvedCfg.size_w * s} x ${approvedCfg.size_h * s}`;
  });

  // Mark as 'applied' any setting line which was successful.
  // (This will put the interactive UI component in charge.)
  // Un-commenting a settings line will apply it again (and then immediately
  // comment it again).
  // Use origSourceLines so that any original indentation is preserved:
  const updatedSourceLines = origSourceLines
    .map((l, i) => (
      linesWithValidSettings.has(i) ? `${settingsAppliedPrefix}${l}` : l
      ));

  // Having processed all the lines now -- if the current inputs came from a
  // file or from a URL, we can clean out all the auto-generated stuff,
  // leaving just the user's inputs:
  if (glob.newInputsImportedFrom) {
    // Drop all the auto-generated content and all successful settings:
    el(userInputsField).value = removeAutoLines(updatedSourceLines);
    // Also, leave them a note confirming where the inputs came from.
    msg.add(`Imported diagram from ${glob.newInputsImportedFrom}`);
    glob.newInputsImportedFrom = null;
  } else {
    el(userInputsField).value = updatedSourceLines.join('\n');
  }

  // Were there any good flows at all? If not, offer a little help and then
  // EXIT EARLY:
  if (!goodFlows.length) {
    msg.add(
      'Enter a list of Flows &mdash; one per line. '
      + 'See the <a href="/manual/" target="_blank">Manual</a> for more help.'
      );

    // Clear the contents of the graph in case there was an old graph left
    // over:
    initializeDiagram(approvedCfg);
    updateColorThemeDisplay();
    return null;
  }

  // MARK Diagram does have data, so prepare to render.

  // Set up the numberStyle object:
  const [groupMark, decimalMark] = approvedCfg.value_format,
    numberStyle = {
      marks: {
        group: groupMark === 'X' ? '' : groupMark,
        decimal: decimalMark,
      },
      decimalPlaces: maxDecimalPlaces,
      // 'trimString' = string to be used in the d3.format expression later:
      trimString: approvedCfg.labelvalue_fullprecision ? '' : '~',
      prefix: approvedCfg.value_prefix,
      suffix: approvedCfg.value_suffix,
    };

  // Deal with inheritance swap if graph is reversed:
  if (approvedCfg.layout_reversegraph) {
    // Only two of the possible values require any change:
    switch (approvedCfg.flow_inheritfrom) {
      case 'source': approvedCfg.flow_inheritfrom = 'target'; break;
      case 'target': approvedCfg.flow_inheritfrom = 'source'; break;
      // no default
    }
  }

  // All is ready. Do the actual rendering:
  render_sankey(approvedNodes, approvedFlows, approvedCfg, numberStyle);

  // MARK Post-Render Activity - various stats & message updates.

  // withUnits: Format a value with the current style.
  function withUnits(n) { return formatUserData(n, numberStyle); }

  // explainSum: Returns an html string showing the flow amounts which
  // add up to a node's total value in or out.
  function explainSum(n, dir) {
    const formattedSum = withUnits(n.total[dir]),
      flowGroup = n.flows[dir].filter((f) => !f.isAShadow),
      flowCt = flowGroup.length;
    if (flowCt === 1) { return formattedSum; }

    // When there are multiple amounts, the amount appears as a hover
    // target with a tooltip showing the breakdown in descending order.
    const breakdown = flowGroup.map((f) => f.value)
        .sort((a, b) => b - a)
        .map((v) => withUnits(v))
        .join(' + ');
    return `<dfn title="${formattedSum} from ${flowCt} `
      + `Flows: ${breakdown}">${formattedSum}</dfn>`;
  }

  // Given maxDecimalPlaces, we can derive the smallest important
  // difference, defined as smallest-input-decimal/10; this lets us work
  // around various binary/decimal math issues.
  const epsilonDifference = 10 ** (-maxDecimalPlaces - 1),
    differences = [],
    grandTotal = { [IN]: 0, [OUT]: 0 };

  // Look for imbalances in Nodes so we can respond to them:
  approvedNodes.forEach((n, i) => {
    // Note: After rendering, there are now more keys in the node records,
    // including 'total' and 'value'.
    // Skip checking any nodes which don't have flows on both sides -- those
    // are the origins & endpoints for the whole graph and don't qualify:
    if (n.flows[IN].length && n.flows[OUT].length) {
      const difference = n.total[IN] - n.total[OUT];
      // Is there a difference big enough to matter? (i.e. > epsilon)
      // We'll always calculate this, even if not shown to the user.
      if (Math.abs(difference) > epsilonDifference) {
        differences.push({
          name: n.name,
          total: { [IN]: explainSum(n, IN), [OUT]: explainSum(n, OUT) },
          difference: withUnits(difference),
        });
      }
    } else {
      // Accumulate the grand totals in & out of the graph.
      // (Note: In this clause, at least one of these sides will have 0 flows
      // every time.)
      // This logic looks counterintuitive, but:
      //   The grand total OUT = the sum of all *endpoint* nodes, which means:
      //     the sum of all IN values for nodes with no OUT flows & vice versa
      grandTotal[OUT] += n.total[IN];
      grandTotal[IN] += n.total[OUT];
    }

    // Btw, check if this is a new maximum node:
    if (n.value > maxNodeVal) {
      maxNodeIndex = i;
      maxNodeVal = n.value;
    }
  });

  // Enable/disable the UI options for letting the user show differences.
  // (If there are no differences, the checkbox is useless.)
  const disableDifferenceControls = !differences.length;
  ['meta_listimbalances',
    'layout_attachto_leading',
    'layout_attachto_trailing',
    'layout_attachto_nearest'].forEach((id) => {
      el(id).disabled = disableDifferenceControls;
     });
  el('imbalances_area').setAttribute(
    'aria-disabled',
    disableDifferenceControls.toString()
  );

  // Were there any differences, and does the user want to know?
  if (!disableDifferenceControls && approvedCfg.meta_listimbalances) {
    // Construct a hyper-informative error message about any differences:
    const differenceRows = [
      '<tr><td></td><th>Total In</th><th>Total Out</th><th>Difference</th></tr>',
    ];
    // Make a nice table of the differences:
    differences.forEach((diffRec) => {
      differenceRows.push(
        `<tr><td class="nodename">${escapeHTML(diffRec.name)}</td>`
        + `<td>${diffRec.total[IN]}</td>`
        + `<td>${diffRec.total[OUT]}</td>`
        + `<td>${diffRec.difference}</td></tr>`
      );
    });
    msg.add(
      `<table class="center_basic">${differenceRows.join('\n')}</table>`,
      'difference'
    );
  }

  // Reflect summary stats to the user:
  let totalsMsg
    = `<strong>${approvedFlows.length} Flows</strong> between `
    + `<strong>${approvedNodes.length} Nodes</strong>. `;

  // Do the totals match? If not, mention the different totals:
  if (Math.abs(grandTotal[IN] - grandTotal[OUT]) > epsilonDifference) {
    const gtLt = grandTotal[IN] > grandTotal[OUT] ? '&gt;' : '&lt;';
    totalsMsg
      += `Total Inputs: <strong>${withUnits(grandTotal[IN])}</strong> ${gtLt}`
      + ` Total Outputs: <strong>${withUnits(grandTotal[OUT])}</strong>`;
  } else {
    totalsMsg += 'Total Inputs = Total Outputs = '
      + `<strong>${withUnits(grandTotal[IN])}</strong> &#9989;`;
  }
  msg.add(totalsMsg, 'total');

  updateColorThemeDisplay();

  // Now that the SVG code has been generated, figure out this diagram's
  // Scale & make that available to the user:
  const tallestNodeHeight
    = parseFloat(el(`r${maxNodeIndex}`).getAttributeNS(null, 'height')),
    // Use 1 decimal place to describe the tallest node's height:
    formattedPixelCount = updateMarks(
      d3.format(',.1f')(tallestNodeHeight),
      numberStyle.marks
    ),
    // Show this value using the user's units, but override the number of
    // decimal places to show 4 digits of precision:
    unitsPerPixel = formatUserData(
      maxNodeVal / (tallestNodeHeight || Number.MIN_VALUE),
      { ...numberStyle, decimalPlaces: 4 }
    );
  el('scale_figures').innerHTML
    = `<strong>${unitsPerPixel}</strong> per pixel `
    + `(${withUnits(maxNodeVal)}/${formattedPixelCount}px)`;

  updateResetNodesUI();

  // All done. Give control back to the browser:
  return null;
};

// Debounced version of process_sankey as event handler for keystrokes:
glob.debounced_process_sankey = debounce(glob.process_sankey);

// MARK API Data Functions

// 用于取消正在进行的API请求
let currentApiController = null;

// 安全地获取历史数据，包含边界检查
const getHistoricalData = (dataArray, currentIndex, periodsBack) => {
  if (!Array.isArray(dataArray) || currentIndex < 0 || periodsBack < 0) {
    return null;
  }
  const historicalIndex = currentIndex + periodsBack;
  return (historicalIndex < dataArray.length) ? dataArray[historicalIndex] : null;
};

// 获取公司简称的函数
const getCompanyShortName = async (symbol) => {
  try {
    const url = `https://yfapi.net/v6/finance/quote?region=US&lang=en&symbols=${symbol}`;
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'X-API-KEY': '5OVZb8uI6z6ObTw0Gvjzx1tzaI1tTuO03ePZEapI'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result.length > 0) {
        const quote = data.quoteResponse.result[0];
        // 优先使用displayName，如果没有则使用shortName
        return quote.displayName || quote.shortName || symbol;
      }
    }
  } catch (error) {
    console.error('Error fetching company name:', error);
  }
  // 如果获取失败，返回原始symbol
  return symbol;
};

// 输入清理函数，防止XSS
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>'"]/g, '') // 移除潜在的XSS字符，但保留&符号
    .trim()
    .substring(0, 100); // 限制长度
};

// API数据获取相关函数
glob.showApiDataDialog = () => {
  el('api_data_dialog').style.display = 'block';
  return null;
};

glob.hideApiDataDialog = () => {
  el('api_data_dialog').style.display = 'none';
  el('api_error').style.display = 'none';
  el('api_loading').style.display = 'none';
  return null;
};

glob.showDataPreviewDialog = () => {
  el('data_preview_dialog').style.display = 'block';
  return null;
};

glob.hideDataPreviewDialog = () => {
  el('data_preview_dialog').style.display = 'none';
  return null;
};

// 更新期间选择下拉框
glob.updatePeriodSelection = async () => {
  const symbol = sanitizeInput(elV('api_symbol').trim().toUpperCase());
  const period = elV('api_period');
  const apiKey = elV('api_key').trim();
  const specificPeriodSelect = el('api_specific_period');
  const changeComparisonGroup = el('change_comparison_group');

  // 清空现有选项
  specificPeriodSelect.innerHTML = '<option value="latest">最新期间</option>';

  // 根据期间类型显示/隐藏变化计算方式选项
  if (period === 'quarter') {
    changeComparisonGroup.style.display = 'block';
  } else {
    changeComparisonGroup.style.display = 'none';
  }

  if (!symbol || !apiKey) {
    return;
  }

  // 取消之前的请求
  if (currentApiController) {
    currentApiController.abort();
  }

  // 创建新的控制器
  currentApiController = new AbortController();

  try {
    const url = `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=${period}&apikey=${apiKey}`;

    const response = await fetch(url, {
      signal: currentApiController.signal
    });

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data) && data.length > 0) {
        // 添加所有可用的期间选项
        data.forEach((item, index) => {
          if (item && item.fiscalYear) {
            const periodLabel = period === 'annual'
              ? `${item.fiscalYear} FY`
              : `${item.fiscalYear} ${item.period || ''}`;
            const option = document.createElement('option');
            option.value = index;
            option.textContent = sanitizeInput(periodLabel);
            if (index === 0) {
              option.textContent += ' (最新)';
            }
            specificPeriodSelect.appendChild(option);
          }
        });
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Period selection request cancelled');
      return;
    }
    console.error('Error fetching period options:', error);
  } finally {
    currentApiController = null;
  }
};

glob.fetchFinancialData = async () => {
  const symbol = elV('api_symbol').trim().toUpperCase();
  const period = elV('api_period');
  const apiKey = elV('api_key').trim();
  const specificPeriodIndex = parseInt(elV('api_specific_period')) || 0;
  const changeComparison = elV('change_comparison') || 'yoy'; // 默认为同比

  if (!symbol) {
    el('api_error').textContent = '请输入股票代码';
    el('api_error').style.display = 'block';
    return;
  }

  if (!apiKey) {
    el('api_error').textContent = '请输入FMP API Key';
    el('api_error').style.display = 'block';
    return;
  }

  // 显示加载状态
  el('api_loading').style.display = 'block';
  el('api_error').style.display = 'none';

  try {
    // 获取公司简称
    const companyName = await getCompanyShortName(symbol);

    // 获取收入报表数据
    const incomeUrl = `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=${period}&apikey=${apiKey}`;
    const incomeResponse = await fetch(incomeUrl);
    if (!incomeResponse.ok) {
      throw new Error(`Income statement API error! status: ${incomeResponse.status}`);
    }
    const incomeData = await incomeResponse.json();

    if (!incomeData || incomeData.length === 0) {
      throw new Error('未找到收入报表数据');
    }

    // 获取收入分段数据（如果用户选择了的话）
    let segmentData = null;
    let previousSegmentData = null;
    const includeSegments = el('include_segments').checked;

    if (includeSegments) {
      const segmentUrl = `https://financialmodelingprep.com/stable/revenue-product-segmentation?symbol=${symbol}&period=${period}&apikey=${apiKey}`;
      const segmentResponse = await fetch(segmentUrl);

      if (segmentResponse.ok) {
        const segmentJson = await segmentResponse.json();
        if (segmentJson && segmentJson.length > 0) {
          segmentData = specificPeriodIndex === 0 || elV('api_specific_period') === 'latest'
            ? segmentJson[0]
            : segmentJson[specificPeriodIndex]; // 取对应期间的分段数据
          // 根据用户选择计算periodsBack
          let periodsBack;
          if (period === 'quarter') {
            periodsBack = changeComparison === 'qoq' ? 1 : 4; // Q/Q环比=1，Y/Y同比=4
          } else {
            periodsBack = 1; // 年度只能是同比
          }
          previousSegmentData = getHistoricalData(segmentJson, specificPeriodIndex, periodsBack);
        }
      }
    }

    // 根据用户选择获取对应期间的财报数据
    const selectedIncomeData = specificPeriodIndex === 0 || elV('api_specific_period') === 'latest'
      ? incomeData[0]
      : incomeData[specificPeriodIndex];

    // 根据用户选择计算periodsBack
    let periodsBack;
    if (period === 'quarter') {
      periodsBack = changeComparison === 'qoq' ? 1 : 4; // Q/Q环比=1，Y/Y同比=4
    } else {
      periodsBack = 1; // 年度只能是同比
    }
    const previousIncomeData = getHistoricalData(incomeData, specificPeriodIndex, periodsBack);

    // 转换为桑基图格式，传递计算方式信息和公司名称
    const sankeyData = convertFinancialDataToSankeyFormat(selectedIncomeData, segmentData, previousIncomeData, period, previousSegmentData, changeComparison, companyName);

    // 显示预览对话框
    el('generated_data_preview').value = sankeyData;
    glob.hideApiDataDialog();
    glob.showDataPreviewDialog();

  } catch (error) {
    console.error('Error fetching financial data:', error);
    el('api_error').textContent = `获取数据失败: ${error.message}`;
    el('api_error').style.display = 'block';
  } finally {
    el('api_loading').style.display = 'none';
  }
};

glob.convertFinancialDataToSankeyFormat = (data, segmentData = null, previousData = null, period = 'quarter', previousSegmentData = null, changeComparison = 'yoy', companyName = null) => {
  const {
    symbol,
    fiscalYear,
    period: dataPeriod,
    revenue,
    costOfRevenue,
    grossProfit,
    researchAndDevelopmentExpenses,
    generalAndAdministrativeExpenses,
    sellingAndMarketingExpenses,
    sellingGeneralAndAdministrativeExpenses,
    otherExpenses,
    operatingIncome,
    totalOtherIncomeExpensesNet,
    incomeBeforeTax,
    incomeTaxExpense,
    netIncome
  } = data;

  // 生成标题（清理输入以防止XSS）
  // 使用公司名称替代ticker，并调整格式
  const displayName = companyName ? sanitizeInput(companyName) : sanitizeInput(symbol);
  let title;

  if (period === 'quarter') {
    // 季度格式：NVIDIA Q1 FY2026 Income Statement
    title = `${displayName} ${sanitizeInput(dataPeriod)} FY${sanitizeInput(fiscalYear)} Income Statement`;
  } else {
    // 年度格式：NVIDIA FY2025 Income Statement
    title = `${displayName} FY${sanitizeInput(fiscalYear)} Income Statement`;
  }

  // 将数值转换为百万美元单位
  const MILLION_DIVISOR = 1000000; // 使用常量而不是魔法数字
  const toMillions = (value) => {
    const numValue = Number(value) || 0;
    return Math.round(numValue / MILLION_DIVISOR);
  };

  // 金融术语缩写映射
  const financialAbbreviations = {
    'securities': 'sec.',
    'purchased': 'purch.',
    'agreements': 'agrmnts',
    'borrowed': 'borr.',
    'Federal funds': 'Fed funds',
    'under agreements to resell': 'under resale agrmnts',
    'research and development': 'R&D',
    'general and administrative': 'G&A',
    'selling and marketing': 'S&M',
    'income before tax': 'pre-tax income',
    'income tax expense': 'tax expense',
    'total other income': 'other income',
    'cost of revenue': 'COGS',
    'operating income': 'EBIT',
    'net income': 'net income'
  };

  // 为长节点名称添加换行和缩写的函数
  const formatNodeName = (name, isSegment = false) => {
    let processedName = name;

    // 通用处理：将所有"and"或"And"替换为"&"
    processedName = processedName.replace(/ (and|And) /g, ' & ');

    // 如果是Segmentation节点，进行额外的预处理
    if (isSegment) {
      // 移除末尾的"Revenues"或"Revenue"
      processedName = processedName.replace(/\s+(Revenues?)\s*$/i, '');
    }

    // 特殊处理一些常见的超长名称模式
    const specialPatterns = {
      'Federal funds sold & securities borrowed or purchased under agreements to resell': 'Fed funds sold\\n& sec. borr. or purch.\\nunder resale agrmnts',
      'securities borrowed or purchased under agreements to resell': 'sec. borr. or purch.\\nunder resale agrmnts'
    };

    // 检查是否匹配特殊模式
    if (specialPatterns[processedName]) {
      return specialPatterns[processedName];
    }

    // 应用金融术语缩写（对于超长名称）
    if (processedName.length > 35) {
      Object.entries(financialAbbreviations).forEach(([full, abbrev]) => {
        const regex = new RegExp(full, 'gi');
        processedName = processedName.replace(regex, abbrev);
      });
    }

    // 多级换行处理函数
    const applyMultiLineBreaks = (text, maxLineLength = 22) => {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;

        if (testLine.length <= maxLineLength) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            // 单个词太长，强制换行
            lines.push(word);
          }
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines.join('\\n');
    };

    // 通用的长名称处理逻辑
    if (processedName.length > 25) {
      // 首先尝试智能换行位置

      // 如果包含逗号，尝试在逗号后换行
      if (processedName.includes(', ')) {
        const parts = processedName.split(', ');
        if (parts.length === 2) {
          const result = `${parts[0]},\\n${parts[1]}`;
          // 检查第二行是否还是太长
          if (parts[1].length > 22) {
            return `${parts[0]},\\n${applyMultiLineBreaks(parts[1])}`;
          }
          return result;
        }
      }

      // 如果包含"&"，尝试在"&"前换行
      if (processedName.includes(' & ')) {
        const parts = processedName.split(' & ');
        if (parts.length === 2 && parts[0].length >= 8) {
          const secondPart = `& ${parts[1]}`;
          // 检查第二行是否还是太长
          if (secondPart.length > 22) {
            return `${parts[0]}\\n${applyMultiLineBreaks(secondPart)}`;
          }
          return `${parts[0]}\\n${secondPart}`;
        }
      }

      // 如果没有找到特殊分割点，使用多级换行
      return applyMultiLineBreaks(processedName);
    }

    // 如果名称不长，返回处理后的名称
    return processedName;
  };

  // 计算变化百分比的函数
  const calculateChange = (current, previous) => {
    // 更安全的零值检查，包括 -0 的情况
    if (!previous || Math.abs(previous) === 0) return null;
    const change = ((current - previous) / Math.abs(previous)) * 100;
    // 确保结果是有限数值
    return Number.isFinite(change) ? Math.round(change) : null;
  };

  // 根据计算方式设置changes后缀
  const changeSuffix = (period === 'quarter' && changeComparison === 'qoq') ? 'Q/Q' : 'Y/Y';

  const costOfRevenueM = toMillions(costOfRevenue);
  const grossProfitM = toMillions(grossProfit);
  const rdExpensesM = toMillions(researchAndDevelopmentExpenses);
  const gaExpensesM = toMillions(generalAndAdministrativeExpenses);
  const smExpensesM = toMillions(sellingAndMarketingExpenses);
  const sgaExpensesM = toMillions(sellingGeneralAndAdministrativeExpenses);
  const otherExpensesM = toMillions(otherExpenses);
  const operatingIncomeM = toMillions(operatingIncome);
  const totalOtherIncomeM = toMillions(totalOtherIncomeExpensesNet || 0);
  const incomeBeforeTaxM = toMillions(incomeBeforeTax);
  const incomeTaxExpenseM = toMillions(incomeTaxExpense);
  const netIncomeM = toMillions(netIncome);

  // 计算变化百分比（如果有前期数据）
  let changes = {};
  if (previousData) {
    changes = {
      revenue: calculateChange(revenue, previousData.revenue),
      costOfRevenue: calculateChange(costOfRevenue, previousData.costOfRevenue),
      grossProfit: calculateChange(grossProfit, previousData.grossProfit),
      rdExpenses: calculateChange(researchAndDevelopmentExpenses, previousData.researchAndDevelopmentExpenses),
      gaExpenses: calculateChange(generalAndAdministrativeExpenses, previousData.generalAndAdministrativeExpenses),
      smExpenses: calculateChange(sellingAndMarketingExpenses, previousData.sellingAndMarketingExpenses),
      sgaExpenses: calculateChange(sellingGeneralAndAdministrativeExpenses, previousData.sellingGeneralAndAdministrativeExpenses),
      otherExpenses: calculateChange(otherExpenses, previousData.otherExpenses),
      operatingIncome: calculateChange(operatingIncome, previousData.operatingIncome),
      totalOtherIncome: calculateChange(totalOtherIncomeExpensesNet, previousData.totalOtherIncomeExpensesNet),
      incomeBeforeTax: calculateChange(incomeBeforeTax, previousData.incomeBeforeTax),
      incomeTaxExpense: calculateChange(incomeTaxExpense, previousData.incomeTaxExpense),
      netIncome: calculateChange(netIncome, previousData.netIncome)
    };
  }

  // 生成桑基图数据
  let sankeyText = `// ${title}\n`;
  sankeyText += `// Generated from Financial Modeling Prep API\n\n`;

  // 收入分段数据（如果有的话）
  if (segmentData && segmentData.data) {
    sankeyText += `// Revenue segmentation\n`;
    const segments = segmentData.data;

    // 验证分段数据总和是否接近总收入
    const segmentTotal = Object.values(segments).reduce((sum, value) => sum + (value || 0), 0);
    const revenueM = toMillions(revenue);
    const segmentTotalM = toMillions(segmentTotal);

    if (Math.abs(revenueM - segmentTotalM) / revenueM > 0.05) {
      sankeyText += `// Note: Segment total (${segmentTotalM}M) differs from reported revenue (${revenueM}M)\n`;
    }

    Object.entries(segments).forEach(([segmentName, segmentValue]) => {
      const segmentM = toMillions(segmentValue);
      if (segmentM > 0) {
        const formattedSegmentName = formatNodeName(segmentName, true); // true表示这是segment节点
        sankeyText += `${formattedSegmentName} [${segmentM}] Revenue\n`;
      }
    });
    sankeyText += `\n`;
  }

  // 构建标准化的财务报表数据流
  sankeyText += `// Income Statement Flow\n`;

  // 第一层：Revenue -> Gross Profit + Cost of Revenue
  sankeyText += `Revenue [${grossProfitM}] Gross Profit\n`;
  sankeyText += `Revenue [${costOfRevenueM}] Cost of Revenue\n\n`;

  // 第二层：Gross Profit -> Operating Income + Operating Expenses
  sankeyText += `// Operating Level\n`;

  // 如果TotalOtherIncomeExpensesNet > 0，先显示这个收入流
  if (totalOtherIncomeM > 0) {
    sankeyText += `Total Other Income [${totalOtherIncomeM}] Income before Tax\n`;
  }

  sankeyText += `Gross Profit [${operatingIncomeM}] Operating Income\n`;

  // R&D费用
  if (rdExpensesM > 0) {
    const formattedRdName = formatNodeName('R&D Expenses');
    sankeyText += `Gross Profit [${rdExpensesM}] ${formattedRdName}\n`;
  }

  // SG&A费用处理 - 根据数据可用性选择显示方式
  if (sgaExpensesM > 0) {
    // 如果有合并的SG&A数据，使用合并数据
    const formattedSgaName = formatNodeName('SG&A Expenses');
    sankeyText += `Gross Profit [${sgaExpensesM}] ${formattedSgaName}\n`;
  } else {
    // 否则分别显示GA和SM费用（如果有的话）
    if (gaExpensesM > 0) {
      const formattedGaName = formatNodeName('G&A Expenses');
      sankeyText += `Gross Profit [${gaExpensesM}] ${formattedGaName}\n`;
    }
    if (smExpensesM > 0) {
      const formattedSmName = formatNodeName('S&M Expenses');
      sankeyText += `Gross Profit [${smExpensesM}] ${formattedSmName}\n`;
    }
  }

  // Other Expenses费用
  if (otherExpensesM > 0) {
    sankeyText += `Gross Profit [${otherExpensesM}] Other Expenses\n`;
  }
  sankeyText += `\n`;

  // 第三层：Operating Income -> Income before Tax + Other Income/Expenses
  sankeyText += `// Pre-tax Level\n`;

  // 如果incomeTaxExpense < 0，先显示这个流向（作为收入流入Net Income）
  if (incomeTaxExpenseM < 0) {
    const formattedTaxBenefitName = formatNodeName('Income Tax Benefit');
    sankeyText += `${formattedTaxBenefitName} [${Math.abs(incomeTaxExpenseM)}] Net Income\n`;
  }

  // 处理TotalOtherIncomeExpensesNet
  if (totalOtherIncomeM > 0) {
    // 如果是正数，计算从Operating Income到Income before Tax的剩余部分
    const operatingToTaxM = incomeBeforeTaxM - totalOtherIncomeM;
    if (operatingToTaxM > 0) {
      sankeyText += `Operating Income [${operatingToTaxM}] Income before Tax\n`;
    }
  } else if (totalOtherIncomeM < 0) {
    // 如果是负数，作为费用流出
    sankeyText += `Operating Income [${Math.abs(totalOtherIncomeM)}] Total Other Expenses\n`;
    const operatingToTaxM = incomeBeforeTaxM;
    if (operatingToTaxM > 0) {
      sankeyText += `Operating Income [${operatingToTaxM}] Income before Tax\n`;
    }
  } else {
    // 如果为0，直接从Operating Income到Income before Tax
    sankeyText += `Operating Income [${incomeBeforeTaxM}] Income before Tax\n`;
  }
  sankeyText += `\n`;

  // 第四层：Income before Tax -> Net Income + Tax Expense
  sankeyText += `// Final Level\n`;

  // 根据incomeTaxExpense的正负值处理流向
  if (incomeTaxExpenseM > 0) {
    const formattedTaxExpenseName = formatNodeName('Income Tax Expense');
    sankeyText += `Income before Tax [${netIncomeM}] Net Income\n`;
    sankeyText += `Income before Tax [${incomeTaxExpenseM}] ${formattedTaxExpenseName}\n`;
  } else if (incomeTaxExpenseM < 0) {
    // 负数：作为收益流入Net Income（已在前面处理）
    // 计算从Income before Tax到Net Income的剩余部分
    const incomeBeforeTaxToNetIncomeM = netIncomeM - Math.abs(incomeTaxExpenseM);
    if (incomeBeforeTaxToNetIncomeM > 0) {
      sankeyText += `Income before Tax [${incomeBeforeTaxToNetIncomeM}] Net Income\n`;
    }
  } else {
    // 为0：直接从Income before Tax到Net Income
    sankeyText += `Income before Tax [${netIncomeM}] Net Income\n`;
  }

  sankeyText += `\n// Node styling\n`;

  // 收入分段颜色（如果有的话）
  if (segmentData && segmentData.data) {
    // 统一分段颜色为#0062FF，value颜色也设为#0062FF
    const segmentColor = '#0062FF';
    const segmentValueColor = '#0062FF';
    Object.entries(segmentData.data).forEach(([segmentName, segmentValue]) => {
      const segmentM = toMillions(segmentValue);
      if (segmentM > 0) {
        const formattedSegmentName = formatNodeName(segmentName, true); // true表示这是segment节点
        if (previousSegmentData && previousSegmentData.data && previousSegmentData.data[segmentName]) {
          const previousSegmentM = toMillions(previousSegmentData.data[segmentName]);
          sankeyText += `:${formattedSegmentName} ${segmentColor} [${previousSegmentM}] {,${segmentValueColor},}\n`;
        } else {
          sankeyText += `:${formattedSegmentName} ${segmentColor} {,${segmentValueColor},}\n`;
        }
      }
    });
  }

  // 主要财务节点颜色（包含前值用于显示changes）
  if (previousData) {
    const previousRevenueM = toMillions(previousData.revenue);
    // Revenue节点：value颜色为黑色
    sankeyText += `:Revenue #5E00FF [${previousRevenueM}] {,#000000,}\n`;

    if (grossProfitM > 0) {
      const previousGrossProfitM = toMillions(previousData.grossProfit);
      // Gross Profit节点：value颜色为黑色
      sankeyText += `:Gross Profit #A600FF [${previousGrossProfitM}] {,#000000,}\n`;
    }
    if (costOfRevenueM > 0) {
      const previousCostOfRevenueM = toMillions(previousData.costOfRevenue);
      // Cost of Revenue节点：value颜色为#A600FF
      sankeyText += `:Cost of Revenue #A600FF [${previousCostOfRevenueM}] {,#A600FF,}\n`;
    }
    if (operatingIncomeM > 0) {
      const previousOperatingIncomeM = toMillions(previousData.operatingIncome);
      // Operating Income节点：value颜色为黑色
      sankeyText += `:Operating Income #FF00EA [${previousOperatingIncomeM}] {,#000000,}\n`;
    }
    // Operating层所有费用节点颜色，value颜色设为#FF00EA
    if (rdExpensesM > 0) {
      const previousRdExpensesM = toMillions(previousData.researchAndDevelopmentExpenses);
      const formattedRdName = formatNodeName('R&D Expenses');
      sankeyText += `:${formattedRdName} #FF00EA [${previousRdExpensesM}] {,#FF00EA,}\n`;
    }
    if (sgaExpensesM > 0) {
      const previousSgaExpensesM = toMillions(previousData.sellingGeneralAndAdministrativeExpenses);
      const formattedSgaName = formatNodeName('SG&A Expenses');
      sankeyText += `:${formattedSgaName} #FF00EA [${previousSgaExpensesM}] {,#FF00EA,}\n`;
    } else {
      if (gaExpensesM > 0) {
        const previousGaExpensesM = toMillions(previousData.generalAndAdministrativeExpenses);
        const formattedGaName = formatNodeName('G&A Expenses');
        sankeyText += `:${formattedGaName} #FF00EA [${previousGaExpensesM}] {,#FF00EA,}\n`;
      }
      if (smExpensesM > 0) {
        const previousSmExpensesM = toMillions(previousData.sellingAndMarketingExpenses);
        const formattedSmName = formatNodeName('S&M Expenses');
        sankeyText += `:${formattedSmName} #FF00EA [${previousSmExpensesM}] {,#FF00EA,}\n`;
      }
    }
    if (otherExpensesM > 0) {
      const previousOtherExpensesM = toMillions(previousData.otherExpenses);
      sankeyText += `:Other Expenses #FF00EA [${previousOtherExpensesM}] {,#FF00EA,}\n`;
    }
    // Total Other Income/Expenses节点，value颜色为#FF00EA
    if (totalOtherIncomeM > 0) {
      const previousTotalOtherIncomeM = toMillions(previousData.totalOtherIncomeExpensesNet || 0);
      sankeyText += `:Total Other Income #FF00EA [${previousTotalOtherIncomeM}] {,#FF00EA,}\n`;
    } else if (totalOtherIncomeM < 0) {
      const previousTotalOtherExpensesM = toMillions(Math.abs(previousData.totalOtherIncomeExpensesNet || 0));
      sankeyText += `:Total Other Expenses #FF00EA [${previousTotalOtherExpensesM}] {,#FF00EA,}\n`;
    }
    if (incomeBeforeTaxM > 0) {
      const previousIncomeBeforeTaxM = toMillions(previousData.incomeBeforeTax);
      // Income before Tax节点：value颜色为黑色
      sankeyText += `:Income before Tax #FF0073 [${previousIncomeBeforeTaxM}] {,#000000,}\n`;
    }
    if (netIncomeM > 0) {
      const previousNetIncomeM = toMillions(previousData.netIncome);
      // Net Income节点：value颜色为#FF3700
      sankeyText += `:Net Income #FF3700 [${previousNetIncomeM}] {,#FF3700,}\n`;
    }
    // income tax expense，value颜色为#FF3700
    if (incomeTaxExpenseM > 0) {
      const previousIncomeTaxExpenseM = toMillions(previousData.incomeTaxExpense);
      const formattedTaxExpenseName = formatNodeName('Income Tax Expense');
      sankeyText += `:${formattedTaxExpenseName} #FF3700 [${previousIncomeTaxExpenseM}] {,#FF3700,}\n`;
    }
  } else {
    // 没有前期数据时，使用普通样式
    // Revenue节点：value颜色为黑色
    sankeyText += `:Revenue #5E00FF {,#000000,}\n`;
    if (grossProfitM > 0) {
      // Gross Profit节点：value颜色为黑色
      sankeyText += `:Gross Profit #A600FF {,#000000,}\n`;
    }
    if (costOfRevenueM > 0) {
      // Cost of Revenue节点：value颜色为#A600FF
      sankeyText += `:Cost of Revenue #A600FF {,#A600FF,}\n`;
    }
    if (operatingIncomeM > 0) {
      // Operating Income节点：value颜色为黑色
      sankeyText += `:Operating Income #FF00EA {,#000000,}\n`;
    }
    // Operating层所有费用节点颜色，value颜色设为#FF00EA
    if (rdExpensesM > 0) {
      const formattedRdName = formatNodeName('R&D Expenses');
      sankeyText += `:${formattedRdName} #FF00EA {,#FF00EA,}\n`;
    }
    if (sgaExpensesM > 0) {
      const formattedSgaName = formatNodeName('SG&A Expenses');
      sankeyText += `:${formattedSgaName} #FF00EA {,#FF00EA,}\n`;
    } else {
      if (gaExpensesM > 0) {
        const formattedGaName = formatNodeName('G&A Expenses');
        sankeyText += `:${formattedGaName} #FF00EA {,#FF00EA,}\n`;
      }
      if (smExpensesM > 0) {
        const formattedSmName = formatNodeName('S&M Expenses');
        sankeyText += `:${formattedSmName} #FF00EA {,#FF00EA,}\n`;
      }
    }
    if (otherExpensesM > 0) {
      sankeyText += `:Other Expenses #FF00EA {,#FF00EA,}\n`;
    }
    // Total Other Income/Expenses节点，value颜色为#FF00EA
    if (totalOtherIncomeM > 0) {
      sankeyText += `:Total Other Income #FF00EA {,#FF00EA,}\n`;
    } else if (totalOtherIncomeM < 0) {
      sankeyText += `:Total Other Expenses #FF00EA {,#FF00EA,}\n`;
    }
    if (incomeBeforeTaxM > 0) {
      // Income before Tax节点：value颜色为黑色
      sankeyText += `:Income before Tax #FF0073 {,#000000,}\n`;
    }
    if (netIncomeM > 0) {
      // Net Income节点：value颜色为#FF3700
      sankeyText += `:Net Income #FF3700 {,#FF3700,}\n`;
    }
    // income tax expense，value颜色为#FF3700
    if (incomeTaxExpenseM > 0) {
      const formattedTaxExpenseName = formatNodeName('Income Tax Expense');
      sankeyText += `:${formattedTaxExpenseName} #FF3700 {,#FF3700,}\n`;
    }
  }

  sankeyText += `\n// Settings\n`;
  sankeyText += `diagram_title '${sanitizeInput(title)}'\n`;
  sankeyText += `value_prefix '$'\n`;
  sankeyText += `value_suffix 'M'\n`;
  sankeyText += `size_w 1200\n`;   // 增加画布宽度以容纳所有内容
  sankeyText += `size_h 600\n`;
  sankeyText += `margin_l 160\n`;  // 左边距设为160
  sankeyText += `margin_r 160\n`;  // 右边距设为160
  sankeyText += `margin_t 80\n`;   // 顶部边距设为80
  sankeyText += `margin_b 80\n`;   // 底部边距设为80

  // 新增默认设置
  sankeyText += `node_h 35\n`;
  sankeyText += `node_w 18\n`;     // 稍微增加节点宽度，提供更好的视觉平衡
  sankeyText += `node_border 0\n`;
  sankeyText += `flow_opacity 0.15\n`;
  sankeyText += `flow_curvature 0.58\n`;
  sankeyText += `labels_linespacing 0.35\n`; // 设置标签行间距为0.35
  sankeyText += `node_spacing 85\n`;         // 调整节点间距，优化布局

  // 固定标签距离设置 - 暂时注释掉以避免验证错误
  // sankeyText += `label_margin_fixed y\n`;    // 启用固定标签距离
  // sankeyText += `label_margin_left 12\n`;    // 左侧标签固定距离（像素）
  // sankeyText += `label_margin_right 15\n`;   // 右侧标签固定距离（像素）

  // 字体样式设置
  sankeyText += `title_size 30\n`;            // 标题字体大小设为30
  sankeyText += `labelname_size 11.5\n`;      // 节点名称字体大小（base size设为13）
  sankeyText += `labelname_weight 700\n`;     // 节点名称字体粗细（粗体）
  sankeyText += `labelvalue_weight 700\n`;    // 数值字体粗细（粗体）
  sankeyText += `labelchange_weight 200\n`;   // 变化字体粗细（正常）
  sankeyText += `labels_relativesize 85\n`;   // 相对字体大小（数值和变化相对于名称更小）

  // 注释：segmentation部分节点的value颜色现在通过节点级别设置

  // title渐变色设置
  sankeyText += `title_gradient '#2F9BFF,#0044FF'\n`;

  // 如果有变化数据，启用changes显示
  if (previousData && Object.keys(changes).length > 0) {
    sankeyText += `labelchange_appears y\n`;
    sankeyText += `labelchange_suffix ' ${changeSuffix}'\n`;
  }

  return sankeyText;
};

glob.applyGeneratedData = () => {
  const generatedData = elV('generated_data_preview');
  el(userInputsField).value = generatedData;
  glob.hideDataPreviewDialog();
  glob.process_sankey();
  return null;
};

// Load a diagram definition from the URL if there was one:
document.addEventListener('DOMContentLoaded', () => {
  // 初始化所有必需的元素
  const requiredElements = [
    'flows_in',
    'layout_reversegraph',
    'labelvalue_color',
    'console_area',
    'issue_messages',
    'imbalance_messages',
    'totals_area',
    'info_messages',
    'console_lines'
  ];

  // 检查所有必需的元素是否存在
  const missingElements = requiredElements.filter(id => !document.getElementById(id));
  if (missingElements.length > 0) {
    console.error('Missing required elements:', missingElements);
    return;
  }

  // 初始化页面
  loadFromQueryString();
  // 渲染当前输入
  glob.process_sankey();
});

// Make the linter happy about imported objects:
/* global
 d3 canvg global IN OUT BEFORE AFTER MAXBREAKPOINT
 sampleDiagramRecipes fontMetrics highlightStyles
 settingsMarker settingsAppliedPrefix settingsToBackfill
 userDataMarker sourceHeaderPrefix sourceURLLine
 skmSettings colorGray60 userInputsField breakpointField
 reWholeNumber reHalfNumber reInteger reDecimal reYesNo reYes
 reCommentLine reSettingsValue reSettingsText reNodeLine
 reMoveLine movesMarker
 reFlowTargetWithSuffix reColorPlusOpacity
 reBareColor reRGBColor LZString */

})(typeof window !== 'undefined' ? window : global);
