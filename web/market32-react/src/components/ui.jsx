import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import {Slot} from '@radix-ui/react-slot';
import {cva} from 'class-variance-authority';
import {clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';
import {X} from 'lucide-react';
export const cn=(...args)=>twMerge(clsx(args));
const variants=cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:pointer-events-none disabled:opacity-50",{
 variants:{variant:{default:"bg-brand-600 text-white hover:bg-brand-700 shadow-sm",secondary:"bg-slate-100 text-slate-700 hover:bg-slate-200",outline:"border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",ghost:"text-slate-600 hover:bg-slate-100",destructive:"bg-rose-50 text-rose-600 hover:bg-rose-100",link:"text-brand-700 underline-offset-2 hover:underline"},
 size:{default:"h-10 px-4 py-2",sm:"h-8 px-3 text-xs",lg:"h-11 px-5",icon:"h-9 w-9"}},defaultVariants:{variant:"default",size:"default"}});
export function Button({variant,size,className="",asChild=false,type="button",...props}){const Tag=asChild?Slot:'button';return <Tag type={type} className={cn(variants({variant,size}),className)} {...props}/>};
export const Card=({className="",...props})=><div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-card",className)} {...props}/>;
export const CardHeader=({className="",...props})=><div className={cn("px-5 pt-5 pb-3",className)} {...props}/>;
export const CardTitle=({className="",...props})=><h3 className={cn("text-[15px] font-extrabold tracking-tight text-slate-800",className)} {...props}/>;
export const CardContent=({className="",...props})=><div className={cn("px-5 pb-5",className)} {...props}/>;
export const Input=({className="",...props})=><input className={cn("h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100",className)} {...props}/>;
export const Textarea=({className="",...props})=><textarea className={cn("w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100",className)} {...props}/>;
export const Select=({className="",...props})=><select className={cn("h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-400",className)} {...props}/>;
export const Badge=({className="",tone="green",...props})=><span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",tone==="green"?"bg-emerald-50 text-emerald-700":tone==="red"?"bg-rose-50 text-rose-700":tone==="amber"?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-600",className)} {...props}/>;
export const Table=({className="",...props})=><div className="w-full overflow-x-auto"><table className={cn("w-full min-w-[570px] border-collapse text-left text-sm",className)} {...props}/></div>;
export const TH=({className="",...props})=><th className={cn("border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-[10px] font-extrabold uppercase tracking-[.10em] text-slate-400",className)} {...props}/>;
export const TD=({className="",...props})=><td className={cn("border-b border-slate-100 px-4 py-3.5 text-[12px] text-slate-600",className)} {...props}/>;
export const Dialog=DialogPrimitive.Root;
export const DialogTrigger=DialogPrimitive.Trigger;
export function DialogContent({children,title,...props}){return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-[2px]"/><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[110] max-h-[92dvh] w-[min(94vw,610px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-6 shadow-float" aria-describedby={undefined} {...props}><div className="mb-5 flex items-center justify-between gap-3"><DialogPrimitive.Title className="text-xl font-extrabold tracking-tight text-slate-900">{title}</DialogPrimitive.Title><DialogPrimitive.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X size={18}/></Button></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal>};
export const Tabs=TabsPrimitive.Root;export const TabsList=({className="",...props})=><TabsPrimitive.List className={cn("flex gap-4 overflow-x-auto border-b border-slate-100",className)} {...props}/>;export const TabsTrigger=({className="",...props})=><TabsPrimitive.Trigger className={cn("whitespace-nowrap border-b-2 border-transparent pb-3 pt-2 text-xs font-semibold text-slate-500 data-[state=active]:border-brand-600 data-[state=active]:text-brand-700",className)} {...props}/>;export const TabsContent=TabsPrimitive.Content;
