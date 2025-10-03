import React from "react";

const Section: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = "" }) => (
  <div className={`py-16 md:py-24 px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
);

export default Section;
