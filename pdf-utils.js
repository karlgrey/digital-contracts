// pdf-utils.js — gemeinsame PDFKit-Hilfsfunktionen
const renderSVGSignature = (doc, svgString, x, y, scale = 0.25) => {
  if (!svgString) return;
  try {
    const pathMatches = svgString.matchAll(/<path d="([^"]+)"/g);
    for (const match of pathMatches) {
      const pathData = match[1];
      const commands = pathData.split(/(?=[ML])/);
      let firstPoint = true;
      for (const cmd of commands) {
        const type = cmd[0];
        const coords = cmd.slice(1).trim().split(/\s+/).map(c => parseFloat(c));
        if (type === 'M' && coords.length >= 2) {
          doc.moveTo(x + coords[0] * scale, y + coords[1] * scale);
          firstPoint = false;
        } else if (type === 'L' && coords.length >= 2) {
          doc.lineTo(x + coords[0] * scale, y + coords[1] * scale);
        }
      }
      if (!firstPoint) {
        doc.stroke();
      }
    }
  } catch (error) {
    console.error('Error rendering SVG signature:', error);
  }
};

module.exports = { renderSVGSignature };
