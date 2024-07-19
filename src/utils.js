import ExcelJs from "exceljs";
import * as XLSX from "xlsx";
import {
  PX_TO_PT,
  CELL_REF_REPLACE_REGEX,
  SHEET_TO_CELL_REF_REGEX,
} from "./constants";

const getStylingForClass = (styleTag, className) => {
  const cssRules = styleTag?.sheet?.cssRules || styleTag?.sheet?.rules;
  for (let i = 0; i < cssRules?.length; i++) {
    const cssRule = cssRules[i];
    if (cssRule.selectorText === `.${className}`) {
      return cssRule.style.cssText;
    }
  }
  return "";
};

const parseCssToXDataStyles = (styleString) => {
  if (styleString) {
    const parsedStyles = {};
    const fontStyles = {};
    let borderStyles = {};
    const dimensions = {};
    const styles = styleString.split(";");
    const stylesObject = {};
    styles.forEach((style) => {
      const [property, value] = style.split(":");
      if (property && value) stylesObject[property.trim()] = value.trim();
    });

    let gridStatus = false;
    const parsedStylesObject = parseBorderProperties(stylesObject);
    Object.entries(parsedStylesObject).forEach(([property, value]) => {
      switch (property) {
        case "background":
        case "background-color":
          parsedStyles["bgcolor"] = value;
          break;
        case "color":
          parsedStyles["color"] = value;
          break;
        case "text-decoration":
          if (value === "underline") parsedStyles["underline"] = true;
          else if (value === "line-through") parsedStyles["strike"] = true;
          break;
        case "text-align":
          parsedStyles["align"] = value;
          break;
        case "vertical-align":
          parsedStyles["valign"] = value;
          break;
        case "font-weight":
          const parsedIntValue = parseInt(value);
          fontStyles["bold"] =
            (parsedIntValue !== NaN && parsedIntValue > 400) ||
            value === "bold";
          break;
        case "font-size":
          fontStyles["size"] = parsePtOrPxValue(value);
          break;
        case "font-style":
          fontStyles["italic"] = value === "italic";
          break;
        case "font-family":
          fontStyles["name"] = value;
          break;
        case "border":
        case "border-top":
        case "border-bottom":
        case "border-left":
        case "border-right":
          if (property === "border" && !gridStatus && value === "0px") {
            gridStatus = true;
          }
          const regexp = /[^\s\(]+(\(.+\))?/g;
          const values = String(value).match(regexp) ?? [];
          let parsedValues = [];
          if (values.length > 2) {
            const intValue = parsePtOrPxValue(values[0]);
            const lineStyle =
              values[1] === "solid"
                ? intValue <= 1
                  ? "thin"
                  : intValue <= 2
                    ? "medium"
                    : "thick"
                : values[1];
            const color = ["black", "initial"].includes(values[2])
              ? "#000000"
              : values[2];
            parsedValues = [lineStyle, color];
            if (property === "border") {
              borderStyles = {
                top: parsedValues,
                bottom: parsedValues,
                left: parsedValues,
                right: parsedValues,
              };
            } else {
              const side = property.split("-")[1];
              borderStyles[side] = parsedValues;
            }
          }
          break;
        case "width":
          const widthValue = parsePtOrPxValue(value);
          if (widthValue) dimensions.width = widthValue;
          break;
        case "height":
          const heightValue = parsePtOrPxValue(value);
          if (heightValue) dimensions.height = heightValue;
          break;
      }
    });
    parsedStyles["dimensions"] = dimensions;
    parsedStyles["font"] = fontStyles;
    if (Object.keys(borderStyles).length) parsedStyles["border"] = borderStyles;
    return { parsedStyles, sheetConfig: { gridLine: gridStatus } };
  }
  return { parsedStyles: {}, sheetConfig: { gridLine: false } };
};

const parseBorderProperties = (styles) => {
  const border = {
    "border-top": {},
    "border-right": {},
    "border-bottom": {},
    "border-left": {},
  };
  const others = {};
  const parsedBorders = {};
  for (const key in styles) {
    if (styles.hasOwnProperty(key)) {
      const parts = key.split("-");
      if (
        parts.length === 3 &&
        parts[0] === "border" &&
        ["style", "width", "color"].includes(parts[2])
      ) {
        const side = parts[1];
        const propertyName = "border-" + side;
        if (!border[propertyName]) {
          border[propertyName] = {};
        }
        border[propertyName][parts[2]] = styles[key];
      } else if (
        parts.length === 2 &&
        parts[0] === "border" &&
        ["style", "width", "color"].includes(parts[1])
      ) {
        let value = [];
        if (parts[1] === "color" && styles[key]?.includes("rgb")) {
          value = styles[key].replaceAll(" ", "").split(")");
          value.pop();
          value = value.map((val) => `${val})`);
        } else {
          value = styles[key]?.split(" ");
        }
        if (value.length === 1) {
          border[`border-top`][parts[1]] = value[0];
          border[`border-bottom`][parts[1]] = value[0];
          border[`border-left`][parts[1]] = value[0];
          border[`border-right`][parts[1]] = value[0];
        } else if (value.length === 2) {
          border[`border-top`][parts[1]] = value[0];
          border[`border-bottom`][parts[1]] = value[0];
          border[`border-left`][parts[1]] = value[1];
          border[`border-right`][parts[1]] = value[1];
        } else if (value.length === 3) {
          border[`border-top`][parts[1]] = value[0];
          border[`border-right`][parts[1]] = value[1];
          border[`border-left`][parts[1]] = value[1];
          border[`border-bottom`][parts[1]] = value[2];
        } else if (value.length === 4) {
          border[`border-top`][parts[1]] = value[0];
          border[`border-right`][parts[1]] = value[1];
          border[`border-bottom`][parts[1]] = value[2];
          border[`border-left`][parts[1]] = value[3];
        }
      } else {
        others[key] = styles[key];
      }
    }
  }

  Object.keys(border).forEach((key) => {
    const value = border[key];
    if (Object.keys(value).length === 3) {
      const parsedValue =
        value["width"] === "0px"
          ? "none"
          : `${value["width"]} ${value["style"]} ${value["color"]}`;
      parsedBorders[key] = parsedValue;
    }
  });

  return { ...parsedBorders, ...others };
};

const parsePtOrPxValue = (value) => {
  let parsedValue = value;
  if (value) {
    if (value.includes("px")) {
      parsedValue = Math.ceil(Number(value.split("px")[0]));
    } else if (value.includes("pt")) {
      parsedValue = Math.ceil(Number(value.split("pt")[0]) / PX_TO_PT);
    }
  }
  return parsedValue;
};

const parseHtmlToText = (function () {
  const entities = [
    ["nbsp", ""],
    ["middot", "·"],
    ["quot", '"'],
    ["apos", "'"],
    ["gt", ">"],
    ["lt", "<"],
    ["amp", "&"],
  ].map(function (x) {
    return [new RegExp("&" + x[0] + ";", "ig"), x[1]];
  });
  return function parseHtmlToText(str) {
    let o = str
      // Remove new lines and spaces from start of content
      .replace(/^[\t\n\r ]+/, "")
      // Remove new lines and spaces from end of content
      .replace(/[\t\n\r ]+$/, "")
      // Added line which removes any white space characters after and before html tags
      .replace(/>\s+/g, ">")
      .replace(/\s+</g, "<")
      // Replace remaining new lines and spaces with space
      .replace(/[\t\n\r ]+/g, " ")
      // Replace <br> tags with new lines
      .replace(/<\s*[bB][rR]\s*\/?>/g, "\n")
      // Strip HTML elements
      .replace(/<[^>]*>/g, "");
    for (let i = 0; i < entities.length; ++i)
      o = o.replace(entities[i][0], entities[i][1]);
    return o;
  };
})();

const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36);
  return timestamp + random;
};

// Function to match the pattern and replace it
const replaceCellRefWithNew = (str, getNewCell, opts) => {
  const { isSameSheet, sheetName } = opts;
  const newStr = str.replace(
    isSameSheet ? CELL_REF_REPLACE_REGEX : SHEET_TO_CELL_REF_REGEX,
    (word) => {
      const parts = word.split("!");
      if (parts.length > 1) {
        if (parts[0].replaceAll("'", "") === sheetName) {
          const newCell = getNewCell(parts[1]);
          return `${parts[0]}!${newCell}`;
        } else {
          return word;
        }
      } else if (isSameSheet) {
        const newCell = getNewCell(parts[0]);
        return newCell;
      }
    }
  );
  return newStr;
};

const readExcelFile = (file) => {
  const ExcelWorkbook = new ExcelJs.Workbook();
  const styles = {};
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      ExcelWorkbook.xlsx.load(reader.result).then((workbookIns) => {
        workbookIns.eachSheet((sheet) => {
          const sheetName = sheet?.name;
          styles[sheetName] = {};
          sheet.eachRow((row) => {
            row?.eachCell((cell) => {
              const style = cell.style;
              const address = cell.address;
              styles[sheetName][address] = style;
            });
          });
        });

        const data = new Uint8Array(e.target?.result);
        const wb = XLSX?.read(data, {
          type: "array",
          cellStyles: true,
          sheetStubs: true,
        });

        const workbook = addStylesToWorkbook(styles, wb);
        resolve(workbook);
      });
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsArrayBuffer(file);
  });
};

const parseExcelStyleToHTML = (styling, theme) => {
  let styleString = "";
  const parsedStyles = {};
  Object.keys(styling)?.forEach((styleOn) => {
    const style = styling[styleOn];
    switch (styleOn) {
      case "alignment":
        Object.keys(style).forEach((property) => {
          const value = style[property];
          switch (property) {
            case "vertical":
              parsedStyles["display"] = "table-cell";
              parsedStyles["vertical-align"] = value;
              break;
            case "horizontal":
              parsedStyles["text-align"] = value;
              break;
          }
        });
        break;
      case "border":
        Object.keys(style).forEach((side) => {
          const value = style[side];
          switch (side) {
            case "top":
            case "bottom":
            case "right":
            case "left":
              if (value?.style && value.rgb)
                parsedStyles[`border-${side}`] =
                  `1px ${value.style} ${value.rgb};`;
              break;
          }
        });
        break;
      case "fill":
        Object.keys(style)?.forEach((property) => {
          const value = style[property];
          switch (property) {
            case "bgColor":
            case "fgColor":
              if (value?.rgb) {
                parsedStyles["background-color"] = value.rgb.startsWith("#")
                  ? value.rgb
                  : `#${value.rgb}`;
              } else if (value?.argb) {
                parsedStyles["background-color"] = value.argb.startsWith("#")
                  ? `#${value.argb.slice(3)}`
                  : `#${value.argb.slice(2)}`;
              } else if (value?.theme && Object.hasOwn(theme, value.theme))
                parsedStyles["background-color"] =
                  `#${theme[value.theme].rgb}` ?? "#ffffff";
              break;
          }
        });
        break;
      case "font":
        Object.keys(style)?.forEach((property) => {
          const value = style[property];
          switch (property) {
            case "bold":
              parsedStyles["font-weight"] = value ? "bold" : "normal";
              break;
            case "color":
              if (value?.rgb) {
                parsedStyles["color"] = value.rgb.startsWith("#")
                  ? value.rgb
                  : `#${value.rgb}`;
              } else if (value?.argb) {
                parsedStyles["color"] = value.argb.startsWith("#")
                  ? `#${value.argb.slice(3)}`
                  : `#${value.argb.slice(2)}`;
              } else if (value?.theme && Object.hasOwn(theme, value.theme)) {
                parsedStyles["color"] =
                  `#${theme[value.theme].rgb}` ?? "#000000";
              }
              break;
            case "sz":
              const convertedValue = Number(value) / PX_TO_PT;
              parsedStyles["font-size"] = `${convertedValue}px`;
              break;
            case "italic":
              parsedStyles["font-style"] = value ? "italic" : "normal";
              break;
            case "name":
              parsedStyles["font-family"] = value;
              break;
            case "underline":
            case "strike":
              parsedStyles["text-decoration"] = value
                ? property === "underline"
                  ? "underline"
                  : "line-through"
                : "none";
              break;
          }
        });
        break;
    }
  });

  Object.entries(parsedStyles).forEach(([property, value]) => {
    styleString = `${styleString}${property}:${value};`;
  });

  return styleString;
};

const addStylesToWorkbook = (styles, workbook) => {
  const wb = { ...workbook };
  wb.SheetNames.forEach((sheetName) => {
    const worksheet = wb.Sheets[sheetName];
    if (Object.hasOwn(styles, sheetName)) {
      Object.entries(styles[sheetName]).forEach(([cellAddress, cellStyle]) => {
        if (Object.hasOwn(worksheet, cellAddress)) {
          worksheet[cellAddress] = {
            ...worksheet[cellAddress],
            s: parseExcelStyleToHTML(
              cellStyle ?? {},
              wb.Themes?.themeElements?.clrScheme ?? {}
            ),
          };
        }
      });
    }
  });
  return wb;
};

const stox = (wb) => {
  const out = [];
  wb.SheetNames.forEach(function (name) {
    const o = { name: name, rows: {}, cols: {}, styles: [] };
    const ws = wb.Sheets[name];
    let gridStatus = false;
    if (!ws || !ws["!ref"]) return;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    // sheet_to_json will lost empty row and col at begin as default

    // Populating 100 rows and a-z columns by default.
    if (range?.e) {
      if (range.e.r < 99) range.e.r = 99;
      if (range.e.c < 25) range.e.c = 25;
    } else {
      range.e = {
        r: 99,
        c: 25,
      };
    }

    range.s = { r: 0, c: 0 };
    const aoa = XLSX.utils.sheet_to_json(ws, {
      raw: false,
      header: 1,
      range: range,
    });

    aoa.forEach(function (r, i) {
      const cells = {};
      let rowHeight = null;
      r.forEach(function (c, j) {
        cells[j] = { text: c || String(c) };
        const cellRef = XLSX.utils.encode_cell({ r: i, c: j });
        const formattedText = ws[cellRef].w ?? "";
        cells[j].formattedText = formattedText;
        const cellStyle = ws[cellRef].s ?? "";
        const cellMeta = ws[cellRef].metadata;
        const parsedData = parseCssToXDataStyles(cellStyle);
        const parsedCellStyles = parsedData.parsedStyles;
        const sheetConfig = parsedData.sheetConfig;
        if (!gridStatus && sheetConfig?.gridLine) {
          gridStatus = true;
        }
        const dimensions = parsedCellStyles.dimensions;
        delete parsedCellStyles.dimensions;
        if (Object.keys(parsedCellStyles).length) {
          const length = o.styles.push(parsedCellStyles);
          cells[j].style = length - 1;
        }

        if (ws[cellRef]?.f && ws[cellRef].f !== "") {
          cells[j].text = "=" + ws[cellRef].f;
        }

        if (dimensions?.height) rowHeight = dimensions.height;
        if (dimensions?.width) {
          o.cols[j] = { width: dimensions.width };
        }
        if (cellMeta) {
          cells[j].cellMeta = cellMeta;
        }
      });
      if (rowHeight) o.rows[i] = { cells: cells, height: rowHeight };
      else o.rows[i] = { cells: cells };
    });
    o.rows.len = aoa.length;

    o.merges = [];
    (ws["!merges"] || []).forEach(function (merge, i) {
      //Needed to support merged cells with empty content
      if (o.rows[merge.s.r] == null) {
        o.rows[merge.s.r] = { cells: {} };
      }
      if (o.rows[merge.s.r].cells[merge.s.c] == null) {
        o.rows[merge.s.r].cells[merge.s.c] = {};
      }

      o.rows[merge.s.r].cells[merge.s.c].merge = [
        merge.e.r - merge.s.r,
        merge.e.c - merge.s.c,
      ];

      o.merges[i] = XLSX.utils.encode_range(merge);
    });
    o.sheetConfig = { gridLine: !gridStatus };
    out.push(o);
  });

  return out;
};

const rgbaToRgb = (hexColor) => {
  // Assuming a white background, so the background RGB is (255, 255, 255)
  const backgroundR = 255,
    backgroundG = 255,
    backgroundB = 255;

  // Extract RGBA from hex
  let r = parseInt(hexColor.slice(1, 3), 16);
  let g = parseInt(hexColor.slice(3, 5), 16);
  let b = parseInt(hexColor.slice(5, 7), 16);
  let a = parseInt(hexColor.slice(7, 9), 16) / 255.0; // Convert alpha to a scale of 0 to 1

  // Calculate new RGB by blending the original color with the background
  let newR = Math.round((1 - a) * backgroundR + a * r);
  let newG = Math.round((1 - a) * backgroundG + a * g);
  let newB = Math.round((1 - a) * backgroundB + a * b);

  // Convert RGB back to hex
  let newHexColor =
    "#" + ((1 << 24) + (newR << 16) + (newG << 8) + newB).toString(16).slice(1);

  return newHexColor.toUpperCase(); // Convert to uppercase as per original Python function
};

const getNewSheetName = (name, existingNames) => {
  let numericPart = name.match(/\d+$/);
  let baseName = name.replace(/\d+$/, "");

  if (!numericPart) {
    numericPart = "1";
  } else {
    numericPart = String(parseInt(numericPart[0], 10) + 1);
  }

  let newName = baseName + numericPart;

  while (existingNames.includes(newName)) {
    numericPart = String(parseInt(numericPart, 10) + 1);
    newName = baseName + numericPart;
  }

  return newName;
};

export {
  getStylingForClass,
  parseCssToXDataStyles,
  parseHtmlToText,
  generateUniqueId,
  replaceCellRefWithNew,
  readExcelFile,
  stox,
  rgbaToRgb,
  getNewSheetName,
};
