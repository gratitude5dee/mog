 import { cn } from "@/lib/utils";
 
 interface MogLogoProps {
   className?: string;
   size?: "sm" | "md" | "lg" | "xl";
   showWordmark?: boolean;
   showBadge?: boolean;
 }
 
 export function MogLogo({ 
   className, 
   size = "md", 
   showWordmark = true,
   showBadge = true 
 }: MogLogoProps) {
   const sizeClasses = {
     sm: "h-8",
     md: "h-10",
     lg: "h-14",
     xl: "h-20",
   };
 
   const textSizes = {
     sm: "text-lg",
     md: "text-xl",
     lg: "text-2xl",
     xl: "text-3xl",
   };
 
   return (
     <div className={cn("flex items-center gap-2", className)}>
       {/* Lobster Mascot SVG */}
       <svg 
         viewBox="0 0 64 64" 
         className={cn(sizeClasses[size], "w-auto")}
       >
         <defs>
           <linearGradient id="mogBodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
             <stop offset="0%" stopColor="hsl(350 82% 60%)" />
             <stop offset="50%" stopColor="hsl(350 82% 55%)" />
             <stop offset="100%" stopColor="hsl(350 75% 50%)" />
           </linearGradient>
           <linearGradient id="mogHighlightGradient" x1="0%" y1="0%" x2="0%" y2="100%">
             <stop offset="0%" stopColor="hsl(350 85% 70%)" />
             <stop offset="100%" stopColor="hsl(350 82% 60%)" />
           </linearGradient>
           <linearGradient id="mogTealGradient" x1="0%" y1="0%" x2="100%" y2="100%">
             <stop offset="0%" stopColor="hsl(168 70% 50%)" />
             <stop offset="100%" stopColor="hsl(168 75% 60%)" />
           </linearGradient>
         </defs>
         
         {/* Body */}
         <ellipse cx="32" cy="36" rx="14" ry="16" fill="url(#mogBodyGradient)" />
         
         {/* Body highlight */}
         <ellipse cx="28" cy="32" rx="4" ry="8" fill="url(#mogHighlightGradient)" opacity="0.4" />
         
         {/* Tail segments */}
         <ellipse cx="32" cy="52" rx="10" ry="5" fill="url(#mogBodyGradient)" opacity="0.9" />
         <ellipse cx="32" cy="56" rx="8" ry="4" fill="url(#mogBodyGradient)" opacity="0.85" />
         <ellipse cx="32" cy="59" rx="6" ry="3" fill="url(#mogBodyGradient)" opacity="0.8" />
         
         {/* Tail fin */}
         <path d="M26 60 L32 64 L38 60" fill="url(#mogBodyGradient)" />
         
         {/* Claws */}
         <path 
           d="M14 32 C6 30 4 38 12 42 C18 45 24 40 22 34" 
           fill="url(#mogBodyGradient)"
         />
         <path 
           d="M50 32 C58 30 60 38 52 42 C46 45 40 40 42 34" 
           fill="url(#mogBodyGradient)"
         />
         
         {/* Claw pincers */}
         <path d="M6 34 C2 32 2 38 6 38" stroke="url(#mogBodyGradient)" strokeWidth="2" fill="none" />
         <path d="M58 34 C62 32 62 38 58 38" stroke="url(#mogBodyGradient)" strokeWidth="2" fill="none" />
         
         {/* Antennae */}
         <path d="M26 22 C18 14 10 10 4 8" stroke="url(#mogTealGradient)" strokeWidth="2" fill="none" strokeLinecap="round" />
         <path d="M38 22 C46 14 54 10 60 8" stroke="url(#mogTealGradient)" strokeWidth="2" fill="none" strokeLinecap="round" />
         
         {/* Antenna tips */}
         <circle cx="4" cy="8" r="2" fill="url(#mogTealGradient)" />
         <circle cx="60" cy="8" r="2" fill="url(#mogTealGradient)" />
         
         {/* Eyes */}
         <circle cx="26" cy="28" r="4" fill="#1a1a2e" />
         <circle cx="38" cy="28" r="4" fill="#1a1a2e" />
         <circle cx="27" cy="27" r="1.5" fill="white" opacity="0.8" />
         <circle cx="39" cy="27" r="1.5" fill="white" opacity="0.8" />
         
         {/* Eye stalks */}
         <ellipse cx="26" cy="24" rx="3" ry="2" fill="url(#mogBodyGradient)" />
         <ellipse cx="38" cy="24" rx="3" ry="2" fill="url(#mogBodyGradient)" />
       </svg>
       
       {showWordmark && (
         <span className={cn(
           textSizes[size],
           "font-bold tracking-tight text-landing-text"
         )}>
           mog
         </span>
       )}
       
       {showBadge && (
         <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-landing-coral/20 text-landing-coral">
           Alpha
         </span>
       )}
     </div>
   );
 }