import React from 'react';

export interface SvgProps extends React.SVGProps<SVGSVGElement> {
  width?: number | string;
  height?: number | string;
  viewBox?: string;
}

export const Svg: React.FC<SvgProps> = ({ children, ...props }) => (
  <svg {...props}>{children}</svg>
);

export const Circle: React.FC<React.SVGProps<SVGCircleElement>> = (props) => <circle {...props} />;
export const Ellipse: React.FC<React.SVGProps<SVGEllipseElement>> = (props) => <ellipse {...props} />;
export const Rect: React.FC<React.SVGProps<SVGRectElement>> = (props) => <rect {...props} />;
export const Line: React.FC<React.SVGProps<SVGLineElement>> = (props) => <line {...props} />;
export const Path: React.FC<React.SVGProps<SVGPathElement>> = (props) => <path {...props} />;
export const Polygon: React.FC<React.SVGProps<SVGPolygonElement>> = (props) => <polygon {...props} />;
export const Polyline: React.FC<React.SVGProps<SVGPolylineElement>> = (props) => <polyline {...props} />;
export const G: React.FC<React.SVGProps<SVGGElement>> = ({ children, ...props }) => <g {...props}>{children}</g>;
export const Text: React.FC<React.SVGProps<SVGTextElement>> = ({ children, ...props }) => <text {...props}>{children}</text>;
export const TSpan: React.FC<React.SVGProps<SVGTSpanElement>> = ({ children, ...props }) => <tspan {...props}>{children}</tspan>;
export const Defs: React.FC<React.SVGProps<SVGDefsElement>> = ({ children, ...props }) => <defs {...props}>{children}</defs>;
export const LinearGradient: React.FC<React.SVGProps<SVGLinearGradientElement>> = ({ children, ...props }) => (
  <linearGradient {...props}>{children}</linearGradient>
);
export const RadialGradient: React.FC<React.SVGProps<SVGRadialGradientElement>> = ({ children, ...props }) => (
  <radialGradient {...props}>{children}</radialGradient>
);
export const Stop: React.FC<React.SVGProps<SVGStopElement>> = (props) => <stop {...props} />;
export const ClipPath: React.FC<React.SVGProps<SVGClipPathElement>> = ({ children, ...props }) => (
  <clipPath {...props}>{children}</clipPath>
);

export default Svg;
