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


const LOGO_BASE64 = 'data:image/png;base64,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tD4bfVGDi78qXUE7ti/XERKCVTPyCijoRukCjkGXFN5kEhEPShdxDMOEGwRQ2kHTPl0gBep21A3JhvTrXU041mgc3tdVy9qVJmPgivrdTXxMQc3uNkFMaMt+dPiaVSilsFoCKXuVdEioKSQEq3bhrLFXQDHvly7gGNxkchydm/f6ClulC4BE9ppASiefVAJaM27Gdrjme71h0rE9nWyBXrn9xMH+z0oXAC9xSzAFOumae0VaMu76NatQSkHvn4vYfKd0FYsbH0bcfli6inYIpMBidEsBCthI8CTavhtMjmk/yVicjQRjhqALPmq6AWQ4roHT228CKa733mwrwbX783ab95jVyzoyciNhNyD6QTAFuueo0x4s6qOu348IpRT08YelK2jH3h/r6JLy9g/qCAlBSaP1iK2LpasAemazdAHHsFe6AFLJ8nnJMDYLShk33VHuli4EWLqPmuM948b5qo2iw+3EX2FsA7eoSeK//ztC3HSUYAp0z0FzTQmntZOhY6NQSiGb52ebt9mNDyNuf166inb87uelK4A63LwUMTxTugqgJ0ZJnkDzZCUn0fmbyEaGsVlQwv2mY4Lvfqib8NnJfVG6gFPY6foTpz1wN+l7kHVUFf0gmALdc9dxySndiyTBb6GUAkbrETcvl66iHbWM7aklJARdMDwTsW0UFrAaG6ULOIbdpIuolJNlhM+5JMcgrMqkebrtgyTHMHB694TPTmw74diecXMtT3nXShdwSjdcL9NhginQPbcSdc+lGw4ydTIWSing5qU6AhB7T2av7GoKCUFXXL8YceFs6SqAHsgwuudB6QJI6V7pAo7pSukCoCP2mw1qHROgbkfdUW4In53IKNNi+Zx3SxfAt/YTh8B0S6HLbhkZAp1zowkawJuMm4di0hBKWbHResTmO6WraEc1XVLeqSMkBF2zLewFLNcowVNn40SjWOiWLJ+bzaY1OfTVpHl6+11dsaB6uqOc3nbC64V7vtc751rSMNhG0lAW/XG3Ob/5zoNumDT3l4IpvM444zqEUMqKffxh6Qrace9RxPiwdBWLG63POtcA7btwNuL9c6WrACqW4Ykzmxac1kGSz88wQTgMluVeRPzIaAeo3r7uKAu52rwyGet81UnjRN0En5cxmEW/HGTc3ISKCabwOikDKSGUslqb5+vYoB0fRnzyqHQV7RBIgeX6+MOI4ZnSVQCVyrARbg4si8gy+mmrdAGwYjaooR8mzUiDd5MERbtolCRI/rydjIv8PXE36bl3GBGflS4C3mDcBK6zhr+gNoIpvEzaQEoIpazWzUpGWdx+WEeXlM3z9YxSgq4arUdcf690FT0yja9LlwArstEscnfZ2AYGC8rSfWHDk5/0xNHijw1qqNukCSX8SLeMhW0nuGZ/3v1E12B9dBQWy+hKkgcr4EYzLivlhidUZtKM1/LQG9EElFKPWxNKWZHty7PN2ezGhxF7T0pX0Y5aQkLQdVsX6/j+Azpls3QBx5ClywXdNUm08X2jdAGwRONmYf5HiY5J4OTmwyi3knZj6JKNhGN7InHgoU92E5+PPxPmJondJohtIxy64WpznUp/7TXfy6nvUYRSVqCmTgE/qeRZAZvksDrDM0JgQKtGSRa4PVlLG7KEm94vXQAswbhZ+Puxp+ahasIoy5FxVImxPXlk3ZgbCXOTyLhZe9E1BbrhlvBsb+0038fp71OEUlbg5qXZpmx2e08iHn9VuorFjdYjrl8sXQX0y+b5iAtnS1cBVCJDy+N9iza0ZDfJTee5JMcmHMf+XGcUG9RQL2GU5ck4tmccs88BOewn7uCwlfD4oN90TYHuuNtcu1pz7IdJ8/1bzTWqUMqSjdYjNt8pXUU7bj8sXUE7bl7SJQVK2NYtBWjHVukCjsFiDW2ZNDNjM7hSugBY0H6z4POuzihQtbEwylKNIufCedbOG312I+nxO0zaSYh+O+qa8mOb4VDcuDkWrT3Wbb95n7OOLHyptaQXb2k8+mXpCtqx8zBifFi6isXVFBKCbC6cnY3OAljAqOnI0HVV3TBQXJZNks1mkR0ymcyN6HnX9zdU7Sh4JoyyXF+ULuAUdoURU5pExL3SRZzShkA3SR0051EjfaCsifFa1Zo0Y5rerfG9FUpZos3zdXTkGB9G3P68dBXt+M3V0hVAv9UyzgwoZrt0AcfwoMabBoo6SHLPNjTCh0T2I+KDuc3pLB2JgJM56ory7wTPViLjWJJJogAwL7qV+N7rjkA3ie0Kp0AnGK9Vl6PuKHdLF7IsxvcsyfBMxM1KRlXUMrZn8/ysUwNQzvBMxPX3SlcBJJZhw/t+6QKoziTRAkOG8Vr01/5zm9P3kwS+gJM56p6gK8pqZR3bc8+GanrXShdwSqMkD13A6winQHnGa+U3bh6aqbI7yjyhlCXZulhHl5SD/xmx96R0Fe2oJSQE2W1fruP7EVi5KwmevJxo/c2SZAk7bXjik445CqL8qFngsTkNdZoPovy7iLihK8rKbSe8BhhHziAN37Wf+Hi/kWQ8LbzJfDhFB0JOauwerRXGa+UzP044y7rfQoRSlmC0PhtRUYP/87+UrqAdNsGhW4zSAk5hs3QBx9CLGwiK2E+0SHOjdAH02qQ5Xj6a64iSubU/8GpHoTNBlPKuNq9s3i1dAK3J2i0lmjE+UIvdZnPVOBFeZ/6e7UfNK8t6RwY6GHXfZO7hmV49OCOUsgS1BFL2nkSMD0tXsbiaQkJQiwtnjdMCTmTUdErpOosuLNO90gUc0/ulC6B3nt+YfreZwdybhR3oiXFzLrz2XOhMEKWsrCNIdm3UVGXcXAtktCHUTYX2m7Ci7ikcOXhuvOLRPZtz8fIIp3RPb8MoR75XuoDavH8uYvOd0lUsbnwYcfth6SraIZAC3fSbqxH//v8uXQWQxEbpAo5hbFOEJdtPsulzrjlmHQ8sw6RZ0HzcfMYO+riQAz1xdKwfNMe7xfRu2k4wYvN5mQMMvNrdiNhKOEYqmuNo1zUNFRo3n+3d5lxxo3mIIdt5g5Obv2fL1Pm1RkfH4NWmC3WGNdba7EfEA+d6oZTWffxh6QrasffHOrqkvP2DOkJCUKOjLka3Py9dCZDAVukCjsEGPMt2tJiTYQHhimOCFhwFUL60KQ3VO3jueBc4y+Fc0rE9O84nVTp6+jjjOJxhE0z5qHQhsETjJpRyY+5Bhs3m1+Q2f99233VcZ80HxG5FxAUBsaWaNB2171sf+zeDtZ9O/+SD147N87Mn/7MbH9bTveB//OfZxjfQTZOnEf/+/5n9k1bsPPv14FbpIqBl5yLin0oXcQw/1pKWFbiVpFvKpENzoUcR8afSRfBa4+cWMsfNr20YclJfJAnu9dVk7vj+eq7LnGM9r4xrygfNdTv1ynwueNfGFT00ao7Z95t/Zux21CdH13OP54LE1sLy2mgCxu879loxmRtVpUPQS+iU0pLResTNy6WraEctY3s2zwukQNcNz0RsX4r46LelK6mGCx1qlKFLiptwVuVuklDKsFncuF+6EIqbzC1cjiPiL3O/Ppj790B+47nj/evnAmcT4ZPqZBzbExHxQekCWLqdxKGUO0JT9ND8iJ+Y66Jyofl1xnNNLZ7vXGntqz77c2HIo4CKDionM2nWvvZ0CXozoZSW3LxURwBi78nslV1NISGo3fWLEfcPIh5/VbqS/AZTFz1UaZDgabF7pQugN47af/6wdCHHcK5DoZSuf4dkMr+p/Je5BZfx3D8nNqAp5MvSBVTk+cDY180/x8/9+7FwWS8dhU+znV8fODf1wn4TTLlQupBTutKha2go4Sj4cLf5/bm5bipvN7/X0aFd893sdK7sr/mAynwHI+Gw75o0f0+Pm38Kap3AYO2n038yt20xo/XZmJga/Pv/eza+J7s7H842uoEcHn8V8d6vSleR32Aa1775h8HuMf6rAAAAAADZHG2Sn2uCKiN7nG80Hzz5y1z4ZyxczDE8Hw7L2pHspOaPm8dGjy7ue4NBTKbT0mXk9vGHpStox71HdQRSRusCKZDNhbMR75+LeCBXCgAAAADAyx0FKp7vKnTUReVoA/2Hze9HlXd6eN3I1LHgCS142TH3snDYKGkno/nwydEYUgGUJTC+Z0Gb52cbqdmNDyM+eVS6inbcvFS6AuA0Pv5w1jFl8rR0JQAAAAAAJHL0uOOrxsvNh1PmN9D/bu4/H84FWUp52WjUvzw3InVsjCKFvSocNpwLiB0dYz98ybG3CpOXjB39y9yvdQtaMaGUBd28XLqCdtx+WEeXlM3zEZvvlK4COI3ResT19yJuf166EgAAAAAAKjI+ZeeD5wMrr/r3x/n5r/q9cAm1mLwmGPa84XOvecc5rp4/bsav+DUdIZSygO3Ls03U7MaHEXtPSlfRjlpCQtBXWxcj/vFJHSE5AAAAAABSs7kNyyGM1TNrpQvI6uiJ/hr8H/+ldAXt2LpYR0gI+mx4ZjbGh9MZvOUmCQAAAAAAgO5Ym07j69JFZHTz0mzzNLu9JxFf/s/SVSxutB5x/WLpKoA2vH8u4sLZ0lUAAAAAAAAAi9Ip5RRG6xGb75Suoh23H5auoB03L+mSAjXZNooLAAAAAAAA0hNKOYVHvyxdQTt2HkaMD0tXsbiaQkLAzIWzs5FcAAAAAAAAQF7fK11ANhfOzoIc2cMck6cRtz8vXUU7rr8Xsf9V6SqAtv3vZyPuPSpdBQAAAAAAAHBag7WfTncjYrN0IQDAYp6txY/i08G4dB0AAAAAAAAQzfgem1cAAAAAAAAAALRqrXQBAAAAAAAAAADURygFAGrxNzEpXQIAAAAAAAAcWRtMje8BgCrcHQilAAAAAAAA0Bk6pQAAAAAAAAAA0DqhFACogy4pAAAAAAAAdMpaDGxiAUAFnM8BAAAAAADolLXBmk0sAAAAAAAAAADaJZQCABUYDGJcugYAAAAAAACYt/avz4RSAAAAAAAAAABo11rpAgCAxT2L+EvpGgAAAAAAAGDeWnw60O4fAJIbRPy5dA0AAAAAAAAwT6cUAKiDTikAAAAAAAB0ylEoRbcUAMhsGpPSJQAAAAAAAMA8nVIAoAKDqYApAAAAAAAA3bIWETEY2MgCgNQGOqUAAAAAAADQLWsREdNpfF26EADg9AZrQikAAAAAAAB0i/E9AFCBvwqlAAAAAAAA0DFHoRTjewAgs2dCKQAAAAAAAHTLWkTEYCqUAgCpfTpwLgcAAAAAAKBTZp1SBp6uBoDEnMcBAAAAAADonLWIiLXv6ZQCAIk5jwMAAAAAANA5axER//rME9YAkNVAxzMAAAAAAAA6aDa+59OBJ6wBIKlpxJelawAAAAAAAIDnrc39WjAFADKa6pQCAAAAAABA98yHUmxoAUBCg4iD0jUAAAAAAADA8+ZDKVr/A0BCgzXBUgAAAAAAALrH+B4ASO6vf6NTCgAAAAAAAN3zbShlMBVKAYCEJnF3oFMKAAAAAAAAnfNtKGXt+56yBoCEhEoBAAAAAADopG9DKf/61KYWAGQzHcTXpWsAAAAAAACAl/k2lBK7g4mnrQEgl8FUpzMAAAAAAAC6aW3+N4OBjS0AyGQQzt0AAAAAAAB003dCKdNnRgAAQCbffE+XMwAAAAAAALrpu51SPG0NAJlM4r8MnLsBAAAAAADopO+EUta+L5QCAFkYuwcAAAAAAECXfSeU8q+zp60n5coBAI5rGvFl6RoAAAAAAADgVdae/w88dQ0AOQymsV+6BgAAAAAAAHiVF0Ip02eeugaADL5ZEyQFAAAAAACgu17WKcVT1wDQdYMYx6eDcekyAAAAAAAA4FVeCKV88y9CKQDQddPQ2QwAAAAAAIBueyGUEruDiW4pANBta4O4X7oGAAAAAAAAeJ0XQykRMX3m6WsA6LJvQoAUAAAAAACAbntpKGXtLU9fA0CHHcSng3HpIgAAAAAAAOB1XhpK+eung/2ImKy+HADgjQbxuHQJAAAAAAAA8CYvDaU0HqywDgDgmNYGOpoBAAAAAADQfa8Mpaytxe5qSwEA3mgQ46ajGQAAAAAAAHTaK0Mpf/3nODDCBwA6RyAFAAAAAACAFF49vmd3MDHCBwC6ZW0Qe6VrAAAAAAAAgON4dSjFCB8A6BajewAAAAAAAEjktaGUZuPLCB8A6IJp3CtdAgAAAAAAABzXa0MpDRtgANABz9bifukaAAAAAAAA4LjeGEp59i9xdzWlAACvNIjd+HQwLl0GAAAAAAAAHNebO6XsDibTgSezAaCktUHsla4BAAAAAAAATuI443virYERPgBQ0MFfPx3sly4CAAAAAAAATuJYoZS/fjrYHwzCZhgAFDBYEw4FAAAAAAAgn2OFUiIiBoPYWW4pAMALBjH+5tPBbukyAAAAAAAA4KSOHUrRLQUAVk8oFAAAAAAAgKyOHUoJG2MAsFq6pAAAAAAAAJDYiUIpf/10sB8Re8srBwA4sjaIa6VrAAAAAAAAgNM6USglIuLZWtyKiMlyygEAIiJiELtNGBQAAAAAAABSOnEoJT4djCPi3lKqAQAiIuKZkXkAAAAAAAAkd/JQSkQ8+5e4G4MYt18OABARO00IFAAAAAAAANI6VSgldgeTwTQ+ar0aAOi7QYyfnYm7pcsAAAAAAACARfopqs8AAAbDSURBVJ0ulBIR3/x6cH8wiP12ywGAfhsMYifuDial6wAAAAAAAIBFnTqUEhHxzSCuRYSNMwBowyB2v/l0sFu6DAAAAAAAAGjDQqGU+HQwjoid1qoBgL4axPjZwDkVAAAAAACAegza+EPe+r+mX0ynsdHGnwUAfTRYi2u6pAAAAAAAAFCTxTqlNIzxAYAFGNsDAAAAAABAhVoJpRjjAwCnZGwPAAAAAAAAlWplfM+Rt3463Z1GbLb5ZwJAzdbW4t2/fjrYL10HAAAAAAAAtK2dTimNb/4lbsQgxm3+mQBQsR2BFAAAAAAAAGrVaqeUiIjv//303DeD+CIihm3/2QBQi8Eg9r/5r4N3S9cBAAAAAAAAy9Jqp5SIiH/9h8FBROy0/ecCQDUGMf5mENdKlwEAAAAAAADL1HqnlCNrfz+9G4PYWtafDwBJTZ6txY/j04FxdwAAAAAAAFSt9U4pR579w+DGYBD7y/rzASCpHYEUAAAAAAAA+mBpoZSIiG/+V3wQg7DxBgAzO89+PbhbuggAAAAAAABYhaWGUmJ3MHk2iHcFUwDovUHce/brwa3SZQAAAAAAAMCqDFbxQ77/99Nz3wzii4gYruLnAUCXTCPuT389+KB0HQAAAAAAALBKy+2U0vjXfxgcvDWNdyNisoqfBwCdMYiD6Zm4VroMAAAAAAAAWLWVhFKiCaYM1uKjVf08AChuEONnfxvvxt2BUCYAAAAAAAC9s7JQSkTEN58OdgdrnhYHoAcGMX42EEgBAAAAAACgvwYlfuhbP5tenT6Lz0r8bABYuqNAyqeDcelSAAAAAAAAoJQioZQQTAGgVgIpAAAAAAAAELHq8T3zvvl0sDuI+CAijDUAoA6DOHj2t/FjgRQAAAAAAAAoGEqJiPjm14P7b03j3RiEzTsAUhsMYv/Z38a7cXcgbAkAAAAAAAAlx/d8x8+mo7VpfBHTGJUuBQBObBD3nv3XwY3SZQAAAAAAAECXFO2U8q1PB+NnAx1TAEhpRyAFAAAAAAAAXtSNUEo0wZT/FT+OiL3SpQDAMUwGa3Ht2a8Ht0oXAgAAAAAAAF3UjfE9z1n76fRWRGyXrgMAXmoQ42fP4oP4h8FB6VIAAAAAAACgqzoZSomIeOun0yvTQdyJaYxK1wIARwaD2P/mb+ODuDuYlK4FAAAAAAAAuqyzoZSIiPjZdLQ2jS8EUwDoiB3jegAAAAAAAOB4uh1KaRjnA0BRgxivDeLaXz8d7JcuBQAAAAAAALJIEUqJiPjez6Ybz6bxma4pAKzSNOL+9ExcM64HAAAAAAAATiZNKCWiGefzLG5FxGbpUgCo3qQZ13O3dCEAAAAAAACQUa5QSuOtn02vTqexrWsKAMugOwoAAAAAAAAsLmUoJSIirk6Ha9+PWzGIrdKlAFCJQYzXBnHtr58O9kuXAgAAAAAAANnlDaUcmY30+X1EnCtdCgBpTSLi3rMzcVd3FAAAAAAAAGhH/lBKw0gfAE5jMIj9bwZxLT4djEvXAgAAAAAAADWpJpRyZO2n01sxiE3hFABeZzCI/cEgdozqAQAAAAAAgOWoLpQS8e1In6vCKQA8TxgFAAAAAAAAVqPOUMoR4RQAGsIoAAAAAAAAsFp1h1LmvPWz6dXpNLaFUwD6RRgFAAAAAAAAyuhNKOXI93423Xj2LK5GxGbpWgBYmklE3Ht2Ju7G3cGkdDEAAAAAAADQR70LpXzrxnT41j/HlZjG5nQaG6XLAWBhkxjE3tog7uuKAgAAAAAAAOX1N5Qy72fT0VsRG/Es3p9GbETEsHRJABzLOAbxQBAFAAAAAAAAukco5SWaET8bg0Fc0EUFoFMmg0Hcn07jy/9tLe7/86eDcemCAAAAAAAAgJcTSjmGJqRybhBxYRoxiohzpWsC6IHJYBAH04gvB8/i4Ptvxb4QCgAAAAAAAOQhlHIaN6bD7/1znHv2LM7FIEaDiLen0xgKqwCcyiQixoNBHEyn8fVgGmMBFAAAAAAAAMhPKKVl3//76bnpWzF89izORcRwEPF2DGLYhFZGETEsXSPAio0jYjKIGMcgJkfBk7WIg7feionwCQAAAAAAANRJKKWAv/nZdPTXWUAlpt/EaDqIYUQMYxDDQcTfNeGViIiYTr/99eiVfyDA8k2aVwwGcRQiGUdETCP+EtOYDKaz3w/eivH3mn8ncAIAAAAAAAD9JZSS0Y3p8G/+edZx5ZtvYjh968XuK9NvXh5i+TYAc1L/FpgBCphO4+vT/O+OgiIv/XdvffffDb6JyVtvzYInERH//DcxibuDyUv/xwAAAAAAAABv8P8DT6XwPh9ahbMAAAAASUVORK5CYII=';

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

    // 根据用户选择获取对应期间的财报数据
    const selectedIncomeData = specificPeriodIndex === 0 || elV('api_specific_period') === 'latest'
      ? incomeData[0]
      : incomeData[specificPeriodIndex];

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

          // 查找与income statement同一时期的segmentation数据
          const matchingSegmentData = segmentJson.find(segment => {
            // 检查fiscalYear和period是否匹配 - 使用类型转换确保匹配
            const fiscalYearMatch = String(segment.fiscalYear) === String(selectedIncomeData.fiscalYear);
            const periodMatch = period === 'annual' || String(segment.period) === String(selectedIncomeData.period);
            console.log(`Checking segment match: FY${segment.fiscalYear} ${segment.period || 'Annual'} - fiscalYearMatch:${fiscalYearMatch}, periodMatch:${periodMatch}`);
            return fiscalYearMatch && periodMatch;
          });

          if (matchingSegmentData) {
            segmentData = matchingSegmentData;
            console.log('Found matching segment data:', segmentData);
            console.log('Segment data structure:', Object.keys(segmentData));
            if (segmentData.data) {
              console.log('Segment data content:', Object.keys(segmentData.data));
            } else {
              console.warn('Segment data does not have a "data" property');
            }
            console.info(`Found matching segmentation data for ${period === 'annual' ? `FY${selectedIncomeData.fiscalYear}` : `${selectedIncomeData.period} FY${selectedIncomeData.fiscalYear}`}`);

            // 查找历史对比数据，也需要确保时期匹配
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

            previousSegmentData = segmentJson.find(segment => {
              const fiscalYearMatch = String(segment.fiscalYear) === String(targetFiscalYear);
              const periodMatch = period === 'annual' || String(segment.period) === String(targetPeriod);
              return fiscalYearMatch && periodMatch;
            });

            if (previousSegmentData) {
              const comparisonPeriodLabel = period === 'annual'
                ? `FY${targetFiscalYear}`
                : `${targetPeriod} FY${targetFiscalYear}`;
              console.info(`Found matching comparison segmentation data for ${comparisonPeriodLabel}`);
            } else {
              const comparisonPeriodLabel = period === 'annual'
                ? `FY${targetFiscalYear}`
                : `${targetPeriod} FY${targetFiscalYear}`;
              console.warn(`No comparison segmentation data found for ${comparisonPeriodLabel}`);
            }
          } else {
            console.warn(`No matching segment data found for FY${selectedIncomeData.fiscalYear} ${selectedIncomeData.period || 'Annual'}`);

            // 显示可用的分段数据期间
            console.log('Available segment periods:');
            segmentJson.forEach(segment => {
              console.log(`- FY${segment.fiscalYear} ${segment.period || 'Annual'}`);
            });
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
            return `${parts[0]},\\n${applyMultiLineBreaks(secondPart)}`;
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
