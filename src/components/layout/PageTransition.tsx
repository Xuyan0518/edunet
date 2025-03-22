
import React from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
  children: React.ReactNode;
}

const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
  const location = useLocation();

  return (
    <TransitionGroup className="w-full h-full relative">
      <CSSTransition
        key={location.key}
        timeout={{ enter: 400, exit: 300 }}
        classNames="page-transition"
      >
        <div className="w-full h-full">
          {children}
        </div>
      </CSSTransition>
    </TransitionGroup>
  );
};

export default PageTransition;
