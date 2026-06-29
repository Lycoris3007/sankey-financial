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

    let svgInnerHTML = svgEl.innerHTML;
    if (svgInnerHTML.includes('i/goai-logo.png')) {
      const logoResponse = await fetch('i/goai-logo.png');
      if (logoResponse.ok) {
        const logoBlob = await logoResponse.blob();
        const logoDataUri = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(logoBlob);
        });
        svgInnerHTML = svgInnerHTML.replaceAll('i/goai-logo.png', logoDataUri);
      }
    }

    // 创建一个新的SVG字符串，包含完整的命名空间和内嵌资源
    const svgData = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
      <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
        width="${scaled.w}" height="${scaled.h}" viewBox="0 0 ${width} ${height}"
        style="background-color: white;">
        ${svgInnerHTML}
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
    const logoWidth = 220;
    const logoHeight = Math.round(logoWidth * 129 / 545);
    const logoX = cfg.size_w / 2 - graph.final_margin_l - logoWidth / 2;
    const logoY = graph.h + cfg.margin_b - logoHeight - 8;
    diagLabels.append('image')
      .attr('id', 'goai-logo')
      .attr('href', 'i/goai-logo.png')
      .attr('xlink:href', 'i/goai-logo.png')
      .attr('x', ep(logoX))
      .attr('y', ep(logoY))
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
