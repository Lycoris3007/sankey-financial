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

const LOGO_ASPECT_RATIO = 192 / 813;
const LOGO_DISPLAY_WIDTH = 360;
const LOGO_DISPLAY_HEIGHT = Math.round(LOGO_DISPLAY_WIDTH * LOGO_ASPECT_RATIO);

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

    // 创建一个新的SVG字符串，包含完整的命名空间、样式和logo
    const svgData = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
      <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
        width="${scaled.w}" height="${scaled.h}" viewBox="0 0 ${width} ${height}"
        style="background-color: white;">
        ${svgEl.innerHTML}
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
    const logoWidth = LOGO_DISPLAY_WIDTH;
    const logoHeight = LOGO_DISPLAY_HEIGHT;
    const x = cfg.size_w / 2 - graph.final_margin_l - logoWidth / 2;
    const y = graph.h + cfg.margin_b - logoHeight + 10;
    diagLabels.append('image')
      .attr('xlink:href', 'i/logo.jpg')
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
  const logoWidth = LOGO_DISPLAY_WIDTH;
  const logoHeight = LOGO_DISPLAY_HEIGHT; // 保持原始比例
  diagramRoot.append('g')
    .attr('id', 'sankeymatic-logo')
    .html(`
      <image x="${cfg.size_w / 2 - logoWidth/2}" y="${cfg.size_h - logoHeight + 10}" width="${logoWidth}" height="${logoHeight}"
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

// 获取上一季度的函数
const getPreviousQuarter = (currentQuarter) => {
  const quarterMap = {
    'Q1': 'Q4',
    'Q2': 'Q1',
    'Q3': 'Q2',
    'Q4': 'Q3'
  };
  return quarterMap[currentQuarter] || currentQuarter;
};

// 输入清理函数，防止XSS
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>'"]/g, '') // 移除潜在的XSS字符，但保留&符号
    .trim()
    .substring(0, 100); // 限制长度
};

// 专门处理segment名称的函数，去掉"segment member"、"member"和"segment"结尾，并将"and"替换为"&"
const cleanSegmentName = (segmentName) => {
  if (typeof segmentName !== 'string') return '';

  let cleaned = sanitizeInput(segmentName);

  // 按优先级去掉结尾的后缀（不区分大小写）
  // 1. 先去掉"segment member"（最长的）
  cleaned = cleaned.replace(/\s*segment\s+member\s*$/i, '');

  // 2. 然后去掉"member"
  cleaned = cleaned.replace(/\s*member\s*$/i, '');

  // 3. 最后去掉"segment"
  cleaned = cleaned.replace(/\s*segment\s*$/i, '');

  // 4. 将"and"替换为"&"（作为独立单词，不区分大小写）
  cleaned = cleaned.replace(/\b(and)\b/gi, '&');

  return cleaned.trim();
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

// 切换分段选项的显示/隐藏
glob.toggleSegmentOptions = () => {
  const includeSegments = el('include_segments').checked;
  const segmentTypeGroup = el('segment_type_group');

  if (segmentTypeGroup) {
    segmentTypeGroup.style.display = includeSegments ? 'block' : 'none';
  }
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

    // 根据用户选择获取对应期间的财报数据
    const selectedIncomeData = specificPeriodIndex === 0 || elV('api_specific_period') === 'latest'
      ? incomeData[0]
      : incomeData[specificPeriodIndex];

    // 获取收入分段数据（如果用户选择了的话）
    let segmentData = null;
    let previousSegmentData = null;
    const includeSegments = el('include_segments').checked;
    const segmentType = elV('segment_type') || 'product'; // 默认为产品分段

    if (includeSegments) {
      // 根据用户选择的分段类型构建API URL
      const segmentEndpoint = segmentType === 'geographic'
        ? 'revenue-geographic-segmentation'
        : 'revenue-product-segmentation';
      const segmentUrl = `https://financialmodelingprep.com/stable/${segmentEndpoint}?symbol=${symbol}&period=${period}&apikey=${apiKey}`;

      console.log(`Fetching ${segmentType} segmentation data from:`, segmentUrl);
      const segmentResponse = await fetch(segmentUrl);

      if (segmentResponse.ok) {
        const segmentJson = await segmentResponse.json();
        if (segmentJson && segmentJson.length > 0) {

          // 查找与income statement同一时期的segmentation数据
          const matchingSegmentData = segmentJson.find(segment => {
            // 检查fiscalYear和period是否匹配 - 使用类型转换确保匹配
            const fiscalYearMatch = String(segment.fiscalYear) === String(selectedIncomeData.fiscalYear);
            const periodMatch = period === 'annual' || String(segment.period) === String(selectedIncomeData.period);
            console.log(`Checking segment match: FY${segment.fiscalYear} ${segment.period || 'Annual'} - fiscalYearMatch:${fiscalYearMatch}, periodMatch:${periodMatch}`);
            return fiscalYearMatch && periodMatch;
          });

          if (matchingSegmentData) {
            segmentData = {
              ...matchingSegmentData,
              segmentType: segmentType // 保存分段类型信息
            };
            console.log('Found matching segment data:', segmentData);
            console.log('Segment data structure:', Object.keys(segmentData));
            if (segmentData.data) {
              console.log('Segment data content:', Object.keys(segmentData.data));
            } else {
              console.warn('Segment data does not have a "data" property');
            }
            console.info(`Found matching segmentation data for ${period === 'annual' ? `FY${selectedIncomeData.fiscalYear}` : `${selectedIncomeData.period} FY${selectedIncomeData.fiscalYear}`}`);


          } else {
            console.warn(`No matching segment data found for FY${selectedIncomeData.fiscalYear} ${selectedIncomeData.period || 'Annual'}`);

            // 显示可用的分段数据期间
            console.log('Available segment periods:');
            segmentJson.forEach(segment => {
              console.log(`- FY${segment.fiscalYear} ${segment.period || 'Annual'}`);
            });

            // 当没有匹配的segmentation数据时，使用最新可用的segmentation字段结构
            // 但将所有金额设为100，方便用户手动修改
            if (segmentJson.length > 0) {
              const latestSegmentData = segmentJson[0]; // 使用最新的segmentation数据作为模板
              console.info(`Using latest available segmentation structure from FY${latestSegmentData.fiscalYear} ${latestSegmentData.period || 'Annual'} as template`);

              if (latestSegmentData.data) {
                // 创建一个新的segmentData对象，保留字段结构但设置金额为100
                segmentData = {
                  ...latestSegmentData,
                  fiscalYear: selectedIncomeData.fiscalYear,
                  period: selectedIncomeData.period,
                  segmentType: segmentType, // 保存分段类型信息
                  data: {}
                };

                // 将所有分段的金额设为100M（模板数据）
                const templateValue = 100000000; // 100M USD作为模板值
                Object.keys(latestSegmentData.data).forEach(segmentName => {
                  segmentData.data[segmentName] = templateValue;
                });

                console.info(`Created template segmentation data with $100M for each segment:`, Object.keys(segmentData.data));

                // 对于模板数据，不设置历史对比数据，避免混淆
                // previousSegmentData 保持为 null，这样在颜色设置时不会显示历史值
              }
            }
          }
        }

        // 无论是否找到当前期间的segment数据，都尝试查找历史对比数据
        if (segmentResponse.ok && segmentJson && segmentJson.length > 0) {
          let targetFiscalYear, targetPeriod;

          if (period === 'quarter' && changeComparison === 'qoq') {
            // 环比：上一季度
            targetPeriod = getPreviousQuarter(selectedIncomeData.period);
            // 如果当前是Q1，上一季度是上一财年的Q4
            targetFiscalYear = selectedIncomeData.period === 'Q1'
              ? selectedIncomeData.fiscalYear - 1
              : selectedIncomeData.fiscalYear;
          } else {
            // 同比：上一财年的同一季度/年度
            targetFiscalYear = selectedIncomeData.fiscalYear - 1;
            targetPeriod = selectedIncomeData.period;
          }

          console.log(`Looking for previous segment data: targetFiscalYear=${targetFiscalYear}, targetPeriod=${targetPeriod}`);
          console.log('Available segment data:', segmentJson.map(s => `${s.period} FY${s.fiscalYear}`));

          previousSegmentData = segmentJson.find(segment => {
            const fiscalYearMatch = String(segment.fiscalYear) === String(targetFiscalYear);
            const periodMatch = period === 'annual' || String(segment.period) === String(targetPeriod);
            console.log(`Checking segment: FY${segment.fiscalYear} ${segment.period}, fiscalYearMatch=${fiscalYearMatch}, periodMatch=${periodMatch}`);
            return fiscalYearMatch && periodMatch;
          });

          if (previousSegmentData) {
            const comparisonPeriodLabel = period === 'annual'
              ? `FY${targetFiscalYear}`
              : `${targetPeriod} FY${targetFiscalYear}`;
            console.info(`Found matching comparison segmentation data for ${comparisonPeriodLabel}:`, previousSegmentData);
          } else {
            const comparisonPeriodLabel = period === 'annual'
              ? `FY${targetFiscalYear}`
              : `${targetPeriod} FY${targetFiscalYear}`;
            console.warn(`No comparison segmentation data found for ${comparisonPeriodLabel}`);
          }
        }
      }
    }

    // 根据用户选择计算periodsBack
    let periodsBack;
    if (period === 'quarter') {
      periodsBack = changeComparison === 'qoq' ? 1 : 4; // Q/Q环比=1，Y/Y同比=4
    } else {
      periodsBack = 1; // 年度只能是同比
    }
    const previousIncomeData = getHistoricalData(incomeData, specificPeriodIndex, periodsBack);

    // 转换为桑基图格式，传递计算方式信息和公司名称
    const sankeyData = convertFinancialDataToSankeyFormat(selectedIncomeData, segmentData, previousIncomeData, period, previousSegmentData, changeComparison, symbol);

    // 显示预览对话框
    el('generated_data_preview').value = sankeyData;
    glob.hideApiDataDialog();
    glob.showDataPreviewDialog();

    // 触发桑基图重新处理以应用新的前缀和后缀设置
    // 注意：这里不立即调用process_sankey()，因为用户还需要在预览对话框中确认数据

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
    operatingExpenses,
    operatingIncome,
    totalOtherIncomeExpensesNet,
    incomeBeforeTax,
    incomeTaxExpense,
    netIncome,
    reportedCurrency
  } = data;

  // 根据货币类型确定显示单位和除数
  const getCurrencyInfo = (currency) => {
    const curr = (currency || 'USD').toUpperCase();

    // 不同货币的汇率和显示习惯
    const currencyConfig = {
      'USD': { divisor: 1000000, unit: 'M', name: 'Million USD', symbol: '$' },
      'TWD': { divisor: 1000000000, unit: 'B', name: 'Billion TWD', symbol: 'NT$' },
      'JPY': { divisor: 1000000000, unit: 'B', name: 'Billion JPY', symbol: '¥' },
      'KRW': { divisor: 1000000000, unit: 'B', name: 'Billion KRW', symbol: '₩' },
      'EUR': { divisor: 1000000, unit: 'M', name: 'Million EUR', symbol: '€' },
      'GBP': { divisor: 1000000, unit: 'M', name: 'Million GBP', symbol: '£' },
      'CNY': { divisor: 1000000, unit: 'M', name: 'Million CNY', symbol: '¥' },
      'HKD': { divisor: 1000000, unit: 'M', name: 'Million HKD', symbol: 'HK$' },
      'SGD': { divisor: 1000000, unit: 'M', name: 'Million SGD', symbol: 'S$' },
      'CAD': { divisor: 1000000, unit: 'M', name: 'Million CAD', symbol: 'C$' },
      'AUD': { divisor: 1000000, unit: 'M', name: 'Million AUD', symbol: 'A$' }
    };

    return currencyConfig[curr] || currencyConfig['USD'];
  };

  const currencyInfo = getCurrencyInfo(reportedCurrency);

  // 用于桑基图数值的函数（纯数字）
  const toDisplayNumber = (value) => {
    const numValue = Number(value) || 0;
    return Math.round(numValue / currencyInfo.divisor);
  };

  // 用于格式化显示的函数（带符号）
  const formatCurrency = (value) => {
    const amount = toDisplayNumber(value);
    return `${currencyInfo.symbol}${amount}${currencyInfo.unit}`;
  };

  // 生成标题（清理输入以防止XSS）
  const displayName = companyName ? sanitizeInput(companyName) : sanitizeInput(symbol);
  let title;

  if (period === 'quarter') {
    title = `${displayName} ${sanitizeInput(dataPeriod)} FY${sanitizeInput(fiscalYear)} Income Statement`;
  } else {
    title = `${displayName} FY${sanitizeInput(fiscalYear)} Income Statement`;
  }

  // 设置页面上的货币前缀和后缀
  el('value_prefix').value = currencyInfo.symbol;
  el('value_suffix').value = currencyInfo.unit;

  // 生成桑基图数据
  let sankeyText = `// ${title}\n`;
  sankeyText += `// Generated from Financial Modeling Prep API\n`;
  sankeyText += `// Currency: ${reportedCurrency || 'USD'} (Values in ${currencyInfo.name})\n\n`;

  // 收入分段数据（如果有的话）
  if (segmentData && segmentData.data) {
    // 根据分段类型添加不同的注释
    const segmentType = segmentData.segmentType || 'product'; // 从数据中获取类型，默认为product
    const segmentTypeLabel = segmentType === 'geographic' ? 'Geographic' : 'Product';
    sankeyText += `// Revenue ${segmentTypeLabel.toLowerCase()} segmentation\n`;
    const segments = segmentData.data;

    // 检查是否使用了模板数据
    const segmentValues = Object.values(segments);
    const templateValue = 100 * currencyInfo.divisor;
    const isTemplateData = segmentValues.length > 0 && segmentValues.every(value => value === templateValue);

    if (isTemplateData) {
      sankeyText += `// NOTE: Segmentation data not available for this period.\n`;
      sankeyText += `// Using template structure with placeholder values (${formatCurrency(100 * currencyInfo.divisor)} each).\n`;
      sankeyText += `// Please manually update the values below with actual data.\n`;
    } else {
      // 验证分段数据总和是否接近总收入
      const segmentTotal = Object.values(segments).reduce((sum, value) => sum + (value || 0), 0);
      const revenueM = toDisplayNumber(revenue);
      const segmentTotalM = toDisplayNumber(segmentTotal);

      if (Math.abs(revenueM - segmentTotalM) / revenueM > 0.05) {
        sankeyText += `// Note: Segment total (${formatCurrency(segmentTotal)}) differs from reported revenue (${formatCurrency(revenue)})\n`;
      }
    }

    // 生成分段流
    Object.entries(segments).forEach(([segmentName, segmentValue]) => {
      const cleanName = cleanSegmentName(segmentName);
      const displayValue = toDisplayNumber(segmentValue);
      sankeyText += `${cleanName} [${displayValue}] Revenue\n`;
    });

    sankeyText += `\n`;
  }

  // 主要财务流
  sankeyText += `// Main financial flows\n`;
  sankeyText += `Revenue [${toDisplayNumber(grossProfit)}] Gross Profit\n`;
  sankeyText += `Revenue [${toDisplayNumber(costOfRevenue)}] Cost of Revenue\n\n`;

  // 运营费用
  sankeyText += `// Operating expenses\n`;
  const totalOpExpenses = toDisplayNumber(grossProfit - operatingIncome);
  sankeyText += `Gross Profit [${toDisplayNumber(operatingIncome)}] Operating Income\n`;
  sankeyText += `Gross Profit [${totalOpExpenses}] Operating Expenses\n\n`;



  // 税前收入和最终净收入
  sankeyText += `// Income and taxes\n`;
  if (totalOtherIncomeExpensesNet && Math.abs(totalOtherIncomeExpensesNet) > 0) {
    if (totalOtherIncomeExpensesNet > 0) {
      sankeyText += `Total Other Income [${toDisplayNumber(totalOtherIncomeExpensesNet)}] Income Before Tax\n`;
      sankeyText += `Operating Income [${toDisplayNumber(operatingIncome)}] Income Before Tax\n`;
    } else {
      // 当有其他费用时，先从Operating Income到Income Before Tax，然后显示Total Other Expenses
      const incomeBeforeTaxFromOp = toDisplayNumber(operatingIncome + totalOtherIncomeExpensesNet); // 这应该等于incomeBeforeTax
      sankeyText += `Operating Income [${incomeBeforeTaxFromOp}] Income Before Tax\n`;
      sankeyText += `Operating Income [${toDisplayNumber(Math.abs(totalOtherIncomeExpensesNet))}] Total Other Expenses\n`;
    }
  } else {
    sankeyText += `Operating Income [${toDisplayNumber(operatingIncome)}] Income Before Tax\n`;
  }

  sankeyText += `Income Before Tax [${toDisplayNumber(incomeTaxExpense)}] Income Tax\n`;
  sankeyText += `Income Before Tax [${toDisplayNumber(netIncome)}] Net Income\n\n`;

  // 详细运营费用分解（从Operating Expenses流向具体支出）- 放在最后
  sankeyText += `// Operating expenses breakdown\n`;
  if (researchAndDevelopmentExpenses) {
    sankeyText += `Operating Expenses [${toDisplayNumber(researchAndDevelopmentExpenses)}] R&D Expenses\n`;
  }

  // SG&A相关费用（优先使用更具体的字段）
  if (generalAndAdministrativeExpenses && sellingAndMarketingExpenses) {
    // 有具体的GA和SM数据，使用分开的字段
    sankeyText += `Operating Expenses [${toDisplayNumber(generalAndAdministrativeExpenses)}] General & Admin\n`;
    sankeyText += `Operating Expenses [${toDisplayNumber(sellingAndMarketingExpenses)}] Sales & Marketing\n`;
  } else if (sellingGeneralAndAdministrativeExpenses) {
    // 使用合并的SG&A字段
    sankeyText += `Operating Expenses [${toDisplayNumber(sellingGeneralAndAdministrativeExpenses)}] SG&A Expenses\n`;
  }

  // Other Expenses（operating层面）
  if (otherExpenses) {
    sankeyText += `Operating Expenses [${toDisplayNumber(otherExpenses)}] Other Expenses\n`;
  }
  sankeyText += `\n`;

  // 处理变化数据
  let changeSuffix = '';
  let changeData = null;

  if (previousData) {
    if (period === 'quarter') {
      changeSuffix = changeComparison === 'qoq' ? 'Q/Q' : 'Y/Y';
    } else {
      changeSuffix = 'Y/Y';
    }

    // 计算所有指标的变化并生成正确的节点标签
    const calculateChangeData = (current, previous, metricName) => {
      if (previous === undefined || previous === null) return null;
      const currentDisplay = toDisplayNumber(current);
      const previousDisplay = toDisplayNumber(previous);
      return {
        current: currentDisplay,
        previous: previousDisplay,
        metricName: metricName
      };
    };

    // 主要财务指标
    changeData = {};

    // 添加主要指标
    const mainMetrics = [
      ['Revenue', revenue, previousData.revenue],
      ['Gross Profit', grossProfit, previousData.grossProfit],
      ['Cost of Revenue', costOfRevenue, previousData.costOfRevenue],
      ['Operating Expenses', operatingExpenses, previousData.operatingExpenses],
      ['Operating Income', operatingIncome, previousData.operatingIncome],
      ['Net Income', netIncome, previousData.netIncome],
      ['Income Before Tax', incomeBeforeTax, previousData.incomeBeforeTax],
      ['Income Tax', incomeTaxExpense, previousData.incomeTaxExpense]
    ];

    mainMetrics.forEach(([name, current, previous]) => {
      const data = calculateChangeData(current, previous, name);
      if (data) changeData[name] = data;
    });

    // 添加费用项目（从Operating Expenses流出的具体支出）
    // 1. R&D Expenses
    if (researchAndDevelopmentExpenses && previousData.researchAndDevelopmentExpenses) {
      const data = calculateChangeData(researchAndDevelopmentExpenses, previousData.researchAndDevelopmentExpenses, 'R&D Expenses');
      if (data) changeData['R&D Expenses'] = data;
    }

    // 2. SG&A相关费用（优先使用更具体的字段）
    if (generalAndAdministrativeExpenses && sellingAndMarketingExpenses &&
        previousData.generalAndAdministrativeExpenses && previousData.sellingAndMarketingExpenses) {
      // 有具体的GA和SM数据，使用分开的字段
      const gaData = calculateChangeData(generalAndAdministrativeExpenses, previousData.generalAndAdministrativeExpenses, 'General & Admin');
      if (gaData) changeData['General & Admin'] = gaData;

      const smData = calculateChangeData(sellingAndMarketingExpenses, previousData.sellingAndMarketingExpenses, 'Sales & Marketing');
      if (smData) changeData['Sales & Marketing'] = smData;
    } else if (sellingGeneralAndAdministrativeExpenses && previousData.sellingGeneralAndAdministrativeExpenses) {
      // 使用合并的SG&A字段
      const data = calculateChangeData(sellingGeneralAndAdministrativeExpenses, previousData.sellingGeneralAndAdministrativeExpenses, 'SG&A Expenses');
      if (data) changeData['SG&A Expenses'] = data;
    }

    // 3. Other Expenses（operating层面）
    if (otherExpenses && previousData.otherExpenses) {
      const data = calculateChangeData(otherExpenses, previousData.otherExpenses, 'Other Expenses');
      if (data) changeData['Other Expenses'] = data;
    }

    // 添加非营业收入/费用（从Operating Income流出，流向Income Before Tax）
    if (totalOtherIncomeExpensesNet && previousData.totalOtherIncomeExpensesNet) {
      const nodeName = totalOtherIncomeExpensesNet > 0 ? 'Total Other Income' : 'Total Other Expenses';
      const prevNodeName = previousData.totalOtherIncomeExpensesNet > 0 ? 'Total Other Income' : 'Total Other Expenses';
      if (nodeName === prevNodeName) { // 只有当前后都是同类型时才添加
        const data = calculateChangeData(Math.abs(totalOtherIncomeExpensesNet), Math.abs(previousData.totalOtherIncomeExpensesNet), nodeName);
        if (data) changeData[nodeName] = data;
      }
    }

    // 添加segment数据的previous values（如果有的话）
    console.log('Checking segment data for previous values:');
    console.log('segmentData:', segmentData);
    console.log('previousSegmentData:', previousSegmentData);

    if (segmentData && segmentData.data && previousSegmentData && previousSegmentData.data) {
      console.log('Both current and previous segment data available');
      Object.keys(segmentData.data).forEach(segmentName => {
        const cleanName = cleanSegmentName(segmentName);
        const currentValue = segmentData.data[segmentName];
        const previousValue = previousSegmentData.data[segmentName];
        console.log(`Segment ${cleanName}: current=${currentValue}, previous=${previousValue}`);

        if (previousValue !== undefined && previousValue !== null) {
          const data = calculateChangeData(currentValue, previousValue, cleanName);
          if (data) {
            changeData[cleanName] = data;
            console.log(`Added change data for ${cleanName}:`, data);
          }
        }
      });
    } else {
      console.log('Missing segment data:', {
        hasSegmentData: !!(segmentData && segmentData.data),
        hasPreviousSegmentData: !!(previousSegmentData && previousSegmentData.data)
      });
    }

    // 添加节点样式标签（使用财务层次颜色方案）
    sankeyText += `// Node styling with previous values for change calculation\n`;

    // 定义颜色方案：蓝色->紫色->红色渐变，体现财务数据层次
    const nodeColors = {
      // 主要财务指标
      'Revenue': '#5E00FF',           // 深紫色 - 收入层
      'Gross Profit': '#A600FF',     // 紫色 - 毛利层
      'Cost of Revenue': '#A600FF',  // 紫色 - 成本层
      'Operating Expenses': '#FF00EA', // 紫红色 - 营业费用层
      'Operating Income': '#FF00EA', // 紫红色 - 营业利润层
      'R&D Expenses': '#FF0073',     // 红紫色 - 研发费用（具体支出）
      'SG&A Expenses': '#FF0073',    // 红紫色 - 销管费用（具体支出）
      'Sales & Marketing': '#FF0073', // 红紫色 - 销售费用（具体支出）
      'General & Admin': '#FF0073',  // 红紫色 - 管理费用（具体支出）
      'Other Expenses': '#FF0073',   // 红紫色 - 其他费用（operating层面）
      // 非营业收入/费用
      'Total Other Income': '#FF00EA',     // 紫红色 - 总其他收入
      'Total Other Expenses': '#FF0073',   // 红紫色 - 总其他费用
      'Income Before Tax': '#FF0073', // 红紫色 - 税前利润
      'Income Tax': '#FF3700',       // 红色 - 所得税
      'Net Income': '#FF3700'        // 红色 - 净利润层
    };

    Object.entries(changeData).forEach(([metricName, data]) => {
      // 判断是否为segment数据：如果在segmentData中存在，则使用蓝色
      let color = nodeColors[metricName];
      if (!color) {
        // 检查是否为segment数据
        const isSegmentData = segmentData && segmentData.data && Object.keys(segmentData.data).some(segmentName => {
          return cleanSegmentName(segmentName) === metricName;
        });
        color = isSegmentData ? '#0062FF' : '#5E00FF'; // segment用蓝色，其他用紫色
      }
      // 决定{}里的颜色：主要指标用黑色，其他用节点颜色
      const mainIndicators = ['Revenue', 'Gross Profit', 'Operating Income', 'Income Before Tax', 'Operating Expenses'];
      const bracketColor = mainIndicators.includes(metricName) ? '#000000' : color;
      sankeyText += `:${metricName} ${color} [${data.previous}] {,${bracketColor},}\n`;
    });
    sankeyText += `\n`;
  }

  // 添加没有previous values的节点颜色配置
  sankeyText += `// Node colors - Financial hierarchy color scheme (nodes without previous values)\n`;

  // 获取已经有previous values的节点列表
  const nodesWithPreviousValues = new Set(Object.keys(changeData || {}));

  // Segment部分 - 蓝色系（只为没有previous values的segment设置）
  if (segmentData && segmentData.data) {
    Object.keys(segmentData.data).forEach(segmentName => {
      const cleanName = cleanSegmentName(segmentName);
      if (!nodesWithPreviousValues.has(cleanName)) {
        sankeyText += `:${cleanName} #0062FF {,#0062FF,}\n`;
      }
    });
  }

  // Income Statement部分 - 只为没有previous values的节点设置颜色
  const mainNodes = [
    ['Revenue', '#5E00FF', '{,#000000,}'],
    ['Gross Profit', '#A600FF', '{,#000000,}'],
    ['Cost of Revenue', '#A600FF', '{,#A600FF,}'],
    ['Operating Income', '#FF00EA', '{,#000000,}'],
    ['Income Before Tax', '#FF0073', '{,#000000,}'],
    ['Net Income', '#FF3700', '{,#000000,}'],
    ['Income Tax', '#FF3700', '{,#FF3700,}']
  ];

  mainNodes.forEach(([nodeName, color, style]) => {
    if (!nodesWithPreviousValues.has(nodeName)) {
      sankeyText += `:${nodeName} ${color} ${style}\n`;
    }
  });

  // 费用和其他节点颜色（只为没有previous values的节点设置）
  if (!nodesWithPreviousValues.has('Operating Expenses')) {
    sankeyText += `:Operating Expenses #FF00EA {,#FF00EA,}\n`;
  }

  // 详细费用项目（只为没有previous values的节点设置）
  if (researchAndDevelopmentExpenses && !nodesWithPreviousValues.has('R&D Expenses')) {
    sankeyText += `:R&D Expenses #FF0073 {,#FF0073,}\n`;
  }

  // SG&A相关费用（优先使用更具体的字段）
  if (generalAndAdministrativeExpenses && sellingAndMarketingExpenses) {
    if (!nodesWithPreviousValues.has('General & Admin')) {
      sankeyText += `:General & Admin #FF0073 {,#FF0073,}\n`;
    }
    if (!nodesWithPreviousValues.has('Sales & Marketing')) {
      sankeyText += `:Sales & Marketing #FF0073 {,#FF0073,}\n`;
    }
  } else if (sellingGeneralAndAdministrativeExpenses && !nodesWithPreviousValues.has('SG&A Expenses')) {
    sankeyText += `:SG&A Expenses #FF0073 {,#FF0073,}\n`;
  }

  // Other Expenses（operating层面）
  if (otherExpenses && !nodesWithPreviousValues.has('Other Expenses')) {
    sankeyText += `:Other Expenses #FF0073 {,#FF0073,}\n`;
  }

  // Total Other Income/Expenses（只为没有previous values的节点设置）
  if (totalOtherIncomeExpensesNet && Math.abs(totalOtherIncomeExpensesNet) > 0) {
    if (totalOtherIncomeExpensesNet > 0 && !nodesWithPreviousValues.has('Total Other Income')) {
      sankeyText += `:Total Other Income #FF00EA {,#FF00EA,}\n`;
    } else if (totalOtherIncomeExpensesNet < 0 && !nodesWithPreviousValues.has('Total Other Expenses')) {
      sankeyText += `:Total Other Expenses #FF0073 {,#FF0073,}\n`;
    }
  }
  sankeyText += `\n`;

  // 设置
  sankeyText += `// Settings\n`;
  sankeyText += `diagram_title '${title}'\n`;
  sankeyText += `size_w 1200\n`;
  sankeyText += `size_h 600\n`;
  sankeyText += `margin_l 160\n`;
  sankeyText += `margin_r 160\n`;
  sankeyText += `margin_t 80\n`;
  sankeyText += `margin_b 80\n`;
  sankeyText += `node_h 35\n`;
  sankeyText += `node_w 18\n`;
  sankeyText += `node_border 0\n`;
  sankeyText += `flow_opacity 0.15\n`;
  sankeyText += `flow_curvature 0.58\n`;
  sankeyText += `labels_linespacing 0.35\n`;
  sankeyText += `node_spacing 85\n`;
  sankeyText += `title_size 32\n`;
  sankeyText += `labelname_size 11.5\n`;
  sankeyText += `labelname_weight 700\n`;
  sankeyText += `labelvalue_weight 700\n`;
  sankeyText += `labelchange_weight 200\n`;
  sankeyText += `labels_relativesize 85\n`;
  sankeyText += `title_gradient '#2F9BFF,#0044FF'\n`;

  // 如果有变化数据，启用changes显示
  if (previousData && changeData && Object.keys(changeData).length > 0) {
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
  // 初始化segment选项显示状态
  if (typeof glob.toggleSegmentOptions === 'function') {
    glob.toggleSegmentOptions();
  }
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
