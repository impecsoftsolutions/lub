/*
  # Fix RLS Policies for Pending Cities Master Table

  ## Problem
  The existing RLS policies check for role = 'admin', but the user_roles table 
  does not have an 'admin' role. It has specific roles like 'super_admin', 
  'state_president', etc. This causes all update attempts to be silently blocked.

  ## Changes
  1. Drop existing restrictive RLS policies that check for non-existent 'admin' role
  2. Create new RLS policies that properly check for valid roles:
     - Super admins can update all cities
     - State-level admins can update cities in their state
     - IT Division heads can update all cities
  3. Use consistent role-checking pattern with rest of the system

  ## Security
  - Maintains RLS protection
  - Only allows authorized users with proper roles to update cities
  - Uses the same role hierarchy as defined in user_roles table
*/

-- Drop the old restrictive policies
DROP POLICY IF EXISTS "Admins can view all cities" ON pending_cities_master;
DROP POLICY IF EXISTS "Admins can update cities" ON pending_cities_master;
DROP POLICY IF EXISTS "Admins can delete cities" ON pending_cities_master;

-- Create new policy: Super admins and IT heads can view all cities
CREATE POLICY "Super admins and IT heads can view all cities"
  ON pending_cities_master
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('super_admin', 'it_division_head')
    )
  );

-- Create new policy: State-level admins can view cities in their state
CREATE POLICY "State admins can view cities in their state"
  ON pending_cities_master
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('state_president', 'state_general_secretary')
      AND user_roles.state = pending_cities_master.state_id::text
    )
  );

-- Create new policy: Super admins and IT heads can update all cities
CREATE POLICY "Super admins and IT heads can update cities"
  ON pending_cities_master
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('super_admin', 'it_division_head')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('super_admin', 'it_division_head')
    )
  );

-- Create new policy: State-level admins can update cities in their state
CREATE POLICY "State admins can update cities in their state"
  ON pending_cities_master
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('state_president', 'state_general_secretary')
      AND user_roles.state = pending_cities_master.state_id::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('state_president', 'state_general_secretary')
      AND user_roles.state = pending_cities_master.state_id::text
    )
  );

-- Create new policy: Super admins and IT heads can delete cities
CREATE POLICY "Super admins and IT heads can delete cities"
  ON pending_cities_master
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('super_admin', 'it_division_head')
    )
  );

-- Create new policy: Super admins and IT heads can insert cities
CREATE POLICY "Super admins and IT heads can insert cities"
  ON pending_cities_master
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('super_admin', 'it_division_head')
    )
  );

-- Create new policy: State-level admins can insert cities in their state
CREATE POLICY "State admins can insert cities in their state"
  ON pending_cities_master
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('state_president', 'state_general_secretary')
      AND user_roles.state = pending_cities_master.state_id::text
    )
  );
