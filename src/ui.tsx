import React from 'react';

export const FileCard = ({ children }: { children: React.ReactNode }) => <main className="card">{children}</main>;
export const Header = ({ title, fact, intro }: { title: string; fact?: string; intro?: string }) => (
    <header className="hdr"><h1>{title}</h1>{fact && <p className="fact">{fact}</p>}{intro && <p>{intro}</p>}</header>
);
export const Group = ({ label, heading, children }: { label: string; heading?: boolean; children: React.ReactNode }) => (
    <section className="grp">{heading ? <h2>{label}</h2> : <h3>{label}</h3>}{children}</section>
);
export const Callout = ({ title, tone, children }: { title: string; tone?: 'warning'; children?: React.ReactNode }) => (
    <div className={'callout' + (tone === 'warning' ? ' warn' : '')} role="status"><strong>{title}</strong><div>{children}</div></div>
);
export const Caption = ({ children }: { children: React.ReactNode }) => <p className="caption">{children}</p>;
export const Closing = ({ children }: { children: React.ReactNode }) => <footer className="closing">{children}</footer>;
