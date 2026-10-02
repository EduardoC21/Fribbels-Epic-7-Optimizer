package com.fribbels.fork;

import java.util.List;

/** FORK — corpo de POST /fork/calculateStats: { "builds": [ ForkBuildInput… ] } */
public class ForkCalculateRequest {
    public List<ForkBuildInput> builds;
}
