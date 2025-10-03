import React from "react";

type Props = {
  children: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
};

const NavLink: React.FC<Props> = ({ children, onClick, isActive, className = "" }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "bg-slate-900 text-white shadow-md hover:bg-slate-800"
        : "text-slate-300 bg-slate-800 hover:bg-slate-900 hover:text-white"
    } ${className}`}
  >
    {children}
  </button>
);

export default NavLink;
