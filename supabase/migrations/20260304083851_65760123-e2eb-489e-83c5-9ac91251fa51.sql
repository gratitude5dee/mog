
-- Fix security definer view warning by explicitly setting security invoker
ALTER VIEW public.agent_profiles_safe SET (security_invoker = on);
